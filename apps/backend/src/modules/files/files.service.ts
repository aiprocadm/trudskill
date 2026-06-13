import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable
} from '@nestjs/common';

import { ANTIVIRUS_SCANNER } from '../../infrastructure/antivirus/antivirus.scanner.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../audit/audit.service.js';

import type {
  AntivirusScanner,
  AntivirusVerdict
} from '../../infrastructure/antivirus/antivirus.scanner.js';
import type { PoolClient } from 'pg';

export interface FileMetadata {
  id: string;
  tenantId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

const MATERIAL_ENTITY = 'learning.material';
const PRIMARY_ROLE = 'primary';

const SUBMISSION_MIME_ALLOWLIST = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const SUBMISSION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const UPLOAD_URL_TTL_SECONDS = 900;

export interface UploadIntentInput {
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadIntentOptions {
  /** Storage key prefix segment; defaults to 'submissions'. */
  keyPrefix?: string;
  /** MIME allowlist override; defaults to the practical-submissions allowlist. */
  mimeAllowlist?: ReadonlySet<string>;
  /** Per-purpose size ceiling override, bytes; defaults to SUBMISSION_MAX_BYTES (10 MB). */
  maxBytes?: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(ANTIVIRUS_SCANNER) private readonly scanner: AntivirusScanner,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async register(
    metadata: Omit<FileMetadata, 'id' | 'createdAt'> & {
      bucketName?: string;
      antivirusStatus?: string;
    }
  ): Promise<FileMetadata> {
    const id = `file_${Math.random().toString(36).slice(2, 12)}`;
    const createdAt = new Date().toISOString();
    const bucket = metadata.bucketName ?? 'default';
    const antivirusStatus = metadata.antivirusStatus ?? 'pending';
    await this.db.query(
      `insert into storage.files (id, tenant_id, storage_key, original_name, mime_type, size_bytes, bucket_name, antivirus_status, payload, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb, now(), now())`,
      [
        id,
        metadata.tenantId,
        metadata.storageKey,
        metadata.originalName,
        metadata.mimeType,
        metadata.sizeBytes,
        bucket,
        antivirusStatus
      ]
    );
    return {
      id,
      tenantId: metadata.tenantId,
      storageKey: metadata.storageKey,
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      createdAt
    };
  }

  async getByTenant(tenantId: string): Promise<FileMetadata[]> {
    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      storage_key: string;
      original_name: string;
      mime_type: string;
      size_bytes: string;
      created_at: Date;
    }>(
      `select id, tenant_id, storage_key, original_name, mime_type, size_bytes, created_at
       from storage.files
       where tenant_id = $1 and deleted_at is null
       order by created_at desc`,
      [tenantId]
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      storageKey: r.storage_key,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      createdAt: r.created_at.toISOString()
    }));
  }

  async createUploadIntent(
    tenantId: string,
    input: UploadIntentInput,
    options?: UploadIntentOptions
  ): Promise<UploadIntent> {
    const allowlist = options?.mimeAllowlist ?? SUBMISSION_MIME_ALLOWLIST;
    if (!allowlist.has(input.contentType)) {
      throw new BadRequestException({
        code: 'unsupported_media_type',
        message: 'File type is not allowed'
      });
    }
    const maxBytes = options?.maxBytes ?? SUBMISSION_MAX_BYTES;
    if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
      throw new BadRequestException({
        code: 'file_too_large',
        message: 'File exceeds the allowed size'
      });
    }
    const prefix = options?.keyPrefix ?? 'submissions';
    const safeName = input.originalName.replace(/[^\w.\-]+/g, '_').slice(-80);
    const storageKey = `${prefix}/${tenantId}/${this.uploadId()}_${safeName}`;
    const file = await this.register({
      tenantId,
      storageKey,
      originalName: input.originalName,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes
    });
    const uploadUrl = await this.storage.createPresignedUploadUrl({
      key: storageKey,
      contentType: input.contentType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS
    });
    return { fileId: file.id, uploadUrl, storageKey, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  async createDownloadUrl(tenantId: string, fileId: string): Promise<string> {
    const row = await this.ensureCleanFile(tenantId, fileId);
    return this.storage.createPresignedDownloadUrl({ key: row.storageKey });
  }

  /** Phase 9 Plan A: server-side read (SCORM zip extraction) — same AV gate as download. */
  async getReadableFile(
    tenantId: string,
    fileId: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const row = await this.ensureCleanFile(tenantId, fileId);
    return { storageKey: row.storageKey, sizeBytes: row.sizeBytes };
  }

  private async ensureCleanFile(
    tenantId: string,
    fileId: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const rows = await this.db.query<{
      storage_key: string;
      antivirus_status: string;
      size_bytes: string;
    }>(
      `select storage_key, antivirus_status, size_bytes from storage.files
       where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, fileId]
    );
    if (!rows.length) {
      throw new BadRequestException({
        code: 'file_not_found',
        message: 'File not found for tenant'
      });
    }

    let status = rows[0]!.antivirus_status;
    if (status === 'pending') {
      // Lazy fallback: a file must never be served unscanned, even if the proactive
      // scan at submit did not complete. With the Noop scanner this is instant.
      status = await this.scanFile(tenantId, fileId);
    }

    if (status === 'infected') {
      throw new HttpException(
        { code: 'file_infected', message: 'File failed antivirus scan and cannot be downloaded' },
        423 // Locked
      );
    }
    if (status !== 'clean') {
      // 'error' (or any unexpected state) — needs a re-scan before it can be served.
      throw new ConflictException({
        code: 'file_scan_failed',
        message: 'File antivirus scan did not complete; try again later'
      });
    }

    return {
      storageKey: rows[0]!.storage_key,
      sizeBytes: Number(rows[0]!.size_bytes)
    };
  }

  /**
   * Scans a stored file, persists the verdict + checked_at, and audits the result.
   * Returns the verdict ('clean' | 'infected' | 'error'). Used proactively at submit
   * and lazily by the download gate for 'pending' files.
   */
  async scanFile(tenantId: string, fileId: string, actorId?: string): Promise<AntivirusVerdict> {
    const rows = await this.db.query<{ storage_key: string; antivirus_status: string }>(
      `select storage_key, antivirus_status from storage.files
       where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, fileId]
    );
    if (!rows.length) {
      throw new BadRequestException({
        code: 'file_not_found',
        message: 'File not found for tenant'
      });
    }
    const previous = rows[0]!.antivirus_status;
    const { verdict, detail } = await this.scanner.scan({ key: rows[0]!.storage_key });
    await this.db.query(
      `update storage.files set antivirus_status = $3, antivirus_checked_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, fileId, verdict]
    );
    this.audit.write({
      tenantId,
      actorId: actorId ?? 'system',
      action: 'storage.file_scanned',
      entityType: 'storage.file',
      entityId: fileId,
      oldValues: { antivirusStatus: previous },
      newValues: { antivirusStatus: verdict, ...(detail ? { detail } : {}) }
    });
    return verdict;
  }

  /** Batch-resolves antivirus status for a set of file ids (tenant-scoped). Empty input → no query. */
  async getAntivirusStatuses(tenantId: string, fileIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (fileIds.length === 0) return result;
    const rows = await this.db.query<{ id: string; antivirus_status: string }>(
      `select id, antivirus_status from storage.files
       where tenant_id = $1 and id = any($2) and deleted_at is null`,
      [tenantId, fileIds]
    );
    for (const row of rows) result.set(row.id, row.antivirus_status);
    return result;
  }

  /** Convenience single-file lookup over getAntivirusStatuses. Returns null when unknown. */
  async getAntivirusStatus(tenantId: string, fileId: string): Promise<string | null> {
    const map = await this.getAntivirusStatuses(tenantId, [fileId]);
    return map.get(fileId) ?? null;
  }

  /**
   * Deletes the stored object and soft-deletes the metadata row. Idempotent —
   * a missing/already-deleted row is a no-op. Used by the identity image retention cron.
   */
  async deleteFile(tenantId: string, fileId: string, actorId?: string): Promise<void> {
    const rows = await this.db.query<{ storage_key: string }>(
      `select storage_key from storage.files
       where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, fileId]
    );
    if (!rows.length) return;
    await this.storage.deleteObject({ key: rows[0]!.storage_key });
    await this.db.query(
      `update storage.files set deleted_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, fileId]
    );
    this.audit.write({
      tenantId,
      actorId: actorId ?? 'system',
      action: 'storage.file_deleted',
      entityType: 'storage.file',
      entityId: fileId,
      oldValues: { storageKey: rows[0]!.storage_key }
    });
  }

  private uploadId(): string {
    return Math.random().toString(36).slice(2, 12);
  }

  /** Links a file to a material (primary). Verifies tenant scope on the file row. */
  async ensureMaterialLink(tenantId: string, materialId: string, fileId: string): Promise<void> {
    const fileRows = await this.db.query<{ id: string }>(
      `select id from storage.files where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, fileId]
    );
    if (!fileRows.length) {
      throw new BadRequestException({
        code: 'file_not_found',
        message: 'File not found for tenant'
      });
    }
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(
        `delete from storage.file_links
         where tenant_id = $1 and entity_type = $2 and entity_id = $3 and link_role = $4`,
        [tenantId, MATERIAL_ENTITY, materialId, PRIMARY_ROLE]
      );
      await client.query(
        `insert into storage.file_links (id, tenant_id, file_id, entity_type, entity_id, link_role, is_primary, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, true, now(), now())`,
        [
          `fl_${Math.random().toString(36).slice(2, 12)}`,
          tenantId,
          fileId,
          MATERIAL_ENTITY,
          materialId,
          PRIMARY_ROLE
        ]
      );
    });
  }
}
