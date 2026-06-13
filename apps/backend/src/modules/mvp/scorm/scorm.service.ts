import { randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import AdmZip from 'adm-zip';

import { ScormManifestError, parseScormManifest } from './parse-scorm-manifest.js';
import {
  ScormZipGuardError,
  assertSafeEntryPath,
  contentTypeForPath,
  createZipBudget
} from './scorm-zip-guards.js';
import { backendEnv } from '../../../env.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { RegisterScormPackageRequest } from './scorm.dto.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { UploadIntent, UploadIntentInput } from '../../files/files.service.js';
import type { ScormPackage } from '../mvp.types.js';
import type { Readable } from 'node:stream';

const SCORM_ZIP_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'application/zip',
  'application/x-zip-compressed'
]);

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

@Injectable({ scope: Scope.REQUEST })
export class ScormService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  private newId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }

  private getPackage(tenantId: string, id: string): ScormPackage {
    const pkg = this.state.scormPackages.find(
      (p) => p.tenantId === tenantId && p.id === id && p.status !== 'deleted'
    );
    if (!pkg) {
      throw new NotFoundException({ code: 'not_found', message: 'SCORM package not found' });
    }
    return pkg;
  }

  /** Public read accessor for controller (Task 11) — wraps private getPackage. */
  getPackageView(tenantId: string, id: string): ScormPackage {
    return this.getPackage(tenantId, id);
  }

  listPackages(tenantId: string): { items: ScormPackage[]; total: number } {
    const items = this.state.scormPackages
      .filter((p) => p.tenantId === tenantId && p.status !== 'deleted')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total: items.length };
  }

  async createPackageUploadIntent(
    tenantId: string,
    input: UploadIntentInput
  ): Promise<UploadIntent> {
    return this.files.createUploadIntent(tenantId, input, {
      keyPrefix: 'scorm-packages',
      mimeAllowlist: SCORM_ZIP_MIME_ALLOWLIST,
      maxBytes: backendEnv.SCORM_PACKAGE_MAX_BYTES
    });
  }

  registerPackage(
    tenantId: string,
    actorId: string | undefined,
    request: RegisterScormPackageRequest,
    ctx: RequestContext
  ): ScormPackage {
    const now = new Date().toISOString();
    const id = this.newId('scp');
    const pkg: ScormPackage = {
      id,
      tenantId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      title: request.title?.trim() || 'SCORM package',
      packageStatus: 'uploaded',
      zipFileId: request.zipFileId,
      storagePrefix: `scorm/${tenantId}/${id}`
    };
    this.state.scormPackages.push(pkg);
    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'learning.scorm_package_registered',
      entityType: 'scorm_package',
      entityId: pkg.id,
      newValues: { zipFileId: pkg.zipFileId, packageStatus: pkg.packageStatus },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return pkg;
  }

  async processPackage(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<ScormPackage> {
    const pkg = this.getPackage(tenantId, id);
    // Idempotency: already processed successfully — no-op
    if (pkg.packageStatus === 'ready') return pkg;
    if (pkg.packageStatus === 'processing') {
      throw new ConflictException({
        code: 'scorm_package_processing',
        message: 'Package is already being processed'
      });
    }
    pkg.packageStatus = 'processing';
    // Defensive delete: base tsconfig uses exactOptionalPropertyTypes; backend overrides to false,
    // but use delete to avoid assigning `undefined` to an optional property.
    delete (pkg as { error?: string }).error;
    try {
      const meta = await this.files.getReadableFile(tenantId, pkg.zipFileId);
      const zipBuffer = await streamToBuffer(
        await this.storage.getObjectStream({ key: meta.storageKey })
      );
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);

      // Guard loop FIRST — enforce path safety and declared-size budget before any getData().
      // This prevents a zip-bomb manifest from being decompressed before the budget runs.
      const budget = createZipBudget();
      for (const entry of entries) {
        assertSafeEntryPath(entry.entryName);
        budget.addEntry(entry.header.size);
      }

      const manifestEntry = entries.find((e) => e.entryName === 'imsmanifest.xml');
      if (!manifestEntry) {
        throw new ScormManifestError(
          'scorm_manifest_missing',
          'imsmanifest.xml not found at zip root'
        );
      }
      const manifest = parseScormManifest(manifestEntry.getData().toString('utf8'));
      for (const entry of entries) {
        await this.storage.putObject({
          key: `${pkg.storagePrefix}/${entry.entryName}`,
          body: entry.getData(),
          contentType: contentTypeForPath(entry.entryName)
        });
      }
      pkg.launchHref = manifest.launchHref;
      pkg.manifestTitle = manifest.title;
      if (!pkg.title || pkg.title === 'SCORM package') pkg.title = manifest.title;
      pkg.entryCount = budget.entries;
      pkg.totalBytes = budget.totalBytes;
      pkg.packageStatus = 'ready';
      pkg.updatedAt = new Date().toISOString();
      this.auditService.write({
        tenantId,
        actorId: ctx.userId,
        action: 'learning.scorm_package_processed',
        entityType: 'scorm_package',
        entityId: pkg.id,
        newValues: {
          packageStatus: pkg.packageStatus,
          entryCount: pkg.entryCount,
          totalBytes: pkg.totalBytes,
          launchHref: pkg.launchHref
        },
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      });
      return pkg;
    } catch (error) {
      pkg.packageStatus = 'failed';
      pkg.error =
        error instanceof ScormManifestError || error instanceof ScormZipGuardError
          ? error.code
          : 'scorm_process_failed';
      pkg.updatedAt = new Date().toISOString();
      // best-effort cleanup of partially uploaded entries
      await this.cleanupPrefix(pkg.storagePrefix);
      if (error instanceof ScormManifestError || error instanceof ScormZipGuardError) {
        return pkg; // expected failures: admin sees failed+code, HTTP 200
      }
      throw error; // AV gate (423/409) and infrastructure errors propagate
    }
  }

  private async cleanupPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.storage.listObjectKeys({ prefix: `${prefix}/` });
      for (const key of keys) await this.storage.deleteObject({ key });
    } catch {
      // best-effort: remaining objects will be overwritten on retry
    }
  }

  async deletePackage(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<{ id: string; deleted: true }> {
    const pkg = this.getPackage(tenantId, id);
    const inUse = this.state.materials.some(
      (m) => m.tenantId === tenantId && m.scormPackageId === id && m.status !== 'deleted'
    );
    if (inUse) {
      throw new ConflictException({
        code: 'scorm_package_in_use',
        message: 'Package is referenced by a course material'
      });
    }
    await this.cleanupPrefix(pkg.storagePrefix);
    pkg.status = 'deleted';
    pkg.updatedAt = new Date().toISOString();
    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'learning.scorm_package_deleted',
      entityType: 'scorm_package',
      entityId: pkg.id,
      newValues: { status: 'deleted' },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { id, deleted: true };
  }
}
