import { describe, expect, it, vi } from 'vitest';

import { FilesService } from './files.service.js';

import type { AntivirusScanner } from '../../infrastructure/antivirus/antivirus.scanner.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import type { AuditService } from '../audit/audit.service.js';

function makeFilesService(opts?: {
  antivirusStatus?: string;
  verdict?: 'clean' | 'infected' | 'error';
  emptyDb?: boolean;
}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (opts?.emptyDb) return [];
      if (sql.includes('select') && sql.includes('storage.files')) {
        return [
          {
            storage_key: 'submissions/t1/existing.pdf',
            antivirus_status: opts?.antivirusStatus ?? 'clean',
            size_bytes: '1024'
          }
        ];
      }
      return [];
    }),
    withTransaction: vi.fn()
  } as unknown as DatabaseService;
  const storage = {
    createPresignedUploadUrl: vi.fn(async () => 'https://minio.local/PUT-signed'),
    createPresignedDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed'),
    getObjectStream: vi.fn(),
    deleteObject: vi.fn(async () => undefined)
  } as unknown as S3StorageClient;
  const scanner = {
    scan: vi.fn(async () => ({ verdict: opts?.verdict ?? 'clean' }))
  } as unknown as AntivirusScanner;
  const audit = { write: vi.fn() } as unknown as AuditService;
  return {
    service: new FilesService(db, storage, scanner, audit),
    db,
    storage,
    scanner,
    audit,
    queries
  };
}

describe('FilesService.createUploadIntent', () => {
  it('rejects a disallowed MIME type', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent('t1', {
        originalName: 'x.exe',
        contentType: 'application/x-msdownload',
        sizeBytes: 10
      })
    ).rejects.toMatchObject({ response: { code: 'unsupported_media_type' } });
  });

  it('rejects an oversize file', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent('t1', {
        originalName: 'big.pdf',
        contentType: 'application/pdf',
        sizeBytes: 50 * 1024 * 1024
      })
    ).rejects.toMatchObject({ response: { code: 'file_too_large' } });
  });

  it('registers metadata and returns a presigned PUT url for an allowed file', async () => {
    const { service, storage } = makeFilesService();
    const out = await service.createUploadIntent('t1', {
      originalName: 'work.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    });
    expect(out.fileId).toMatch(/^file_/);
    expect(out.uploadUrl).toBe('https://minio.local/PUT-signed');
    expect(out.expiresInSeconds).toBeGreaterThan(0);
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledTimes(1);
    // The declared size is pinned into the presigned PUT so S3 enforces it server-side.
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 1024 })
    );
  });
});

describe('FilesService.createDownloadUrl gate', () => {
  it('returns a presigned GET url for a clean file', async () => {
    const { service, storage } = makeFilesService({ antivirusStatus: 'clean' });
    const url = await service.createDownloadUrl('t1', 'file_abc');
    expect(url).toBe('https://minio.local/GET-signed');
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
      key: 'submissions/t1/existing.pdf'
    });
  });

  it('refuses an infected file with file_infected', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'infected' });
    await expect(service.createDownloadUrl('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_infected' }
    });
  });

  it('refuses a scan-errored file with file_scan_failed', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'error' });
    await expect(service.createDownloadUrl('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_scan_failed' }
    });
  });

  it('lazily scans a pending file then serves it when clean', async () => {
    const { service, scanner, storage } = makeFilesService({
      antivirusStatus: 'pending',
      verdict: 'clean'
    });
    const url = await service.createDownloadUrl('t1', 'file_abc');
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://minio.local/GET-signed');
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it('lazily scans a pending file and refuses it when infected', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'pending', verdict: 'infected' });
    await expect(service.createDownloadUrl('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_infected' }
    });
  });

  it('throws file_not_found for a missing file', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await expect(service.createDownloadUrl('t1', 'missing')).rejects.toMatchObject({
      response: { code: 'file_not_found' }
    });
  });
});

describe('FilesService.scanFile', () => {
  it('runs the scanner and persists the verdict + checked_at', async () => {
    const { service, scanner, queries } = makeFilesService({ verdict: 'infected' });
    const verdict = await service.scanFile('t1', 'file_abc');
    expect(verdict).toBe('infected');
    expect(scanner.scan).toHaveBeenCalledWith({ key: 'submissions/t1/existing.pdf' });
    const update = queries.find((q) => q.sql.includes('update storage.files'));
    expect(update).toBeTruthy();
    expect(update!.params).toContain('infected');
  });

  it('writes an audit record for the scan', async () => {
    const { service, audit } = makeFilesService({ verdict: 'clean' });
    await service.scanFile('t1', 'file_abc');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'storage.file_scanned',
        entityType: 'storage.file',
        entityId: 'file_abc'
      })
    );
  });

  it('throws file_not_found when the file is missing for the tenant', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await expect(service.scanFile('t1', 'missing')).rejects.toMatchObject({
      response: { code: 'file_not_found' }
    });
  });
});

describe('FilesService.getAntivirusStatuses', () => {
  it('returns a fileId→status map for the tenant', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'file_a', antivirus_status: 'clean' },
      { id: 'file_b', antivirus_status: 'infected' }
    ]);
    const map = await service.getAntivirusStatuses('t1', ['file_a', 'file_b']);
    expect(map.get('file_a')).toBe('clean');
    expect(map.get('file_b')).toBe('infected');
  });

  it('returns an empty map when given no ids (no query)', async () => {
    const { service, db } = makeFilesService();
    const map = await service.getAntivirusStatuses('t1', []);
    expect(map.size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('FilesService.getAntivirusStatus', () => {
  it('resolves a single file status via the batch lookup', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'file_a', antivirus_status: 'clean' }
    ]);
    expect(await service.getAntivirusStatus('t1', 'file_a')).toBe('clean');
  });

  it('returns null when the file is unknown', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    expect(await service.getAntivirusStatus('t1', 'missing')).toBeNull();
  });
});

describe('FilesService.createUploadIntent — options', () => {
  it('uses a custom keyPrefix for the storage key', async () => {
    const { service, queries } = makeFilesService();
    const out = await service.createUploadIntent(
      't1',
      { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1024 },
      { keyPrefix: 'identity' }
    );
    expect(out.storageKey).toMatch(/^identity\/t1\//);
    const insert = queries.find((q) => q.sql.includes('insert into storage.files'));
    expect(insert?.params[2]).toMatch(/^identity\/t1\//);
  });

  it('enforces a custom mime allowlist', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent(
        't1',
        { originalName: 'doc.docx', contentType: 'application/msword', sizeBytes: 10 },
        { mimeAllowlist: new Set(['image/png', 'image/jpeg', 'application/pdf']) }
      )
    ).rejects.toMatchObject({ response: { code: 'unsupported_media_type' } });
  });
});

describe('FilesService.createUploadIntent — maxBytes override', () => {
  it('createUploadIntent honors options.maxBytes override (scorm zip > default 10MB)', async () => {
    // 50 MB при дефолтном лимите 10 MB — должно пройти с override
    const { service } = makeFilesService();
    const intent = await service.createUploadIntent(
      'tenant_demo',
      { originalName: 'course.zip', contentType: 'application/zip', sizeBytes: 50 * 1024 * 1024 },
      {
        maxBytes: 300 * 1024 * 1024,
        mimeAllowlist: new Set(['application/zip']),
        keyPrefix: 'scorm-packages'
      }
    );
    expect(intent.fileId).toBeTruthy();
  });

  it('createUploadIntent rejects sizeBytes above options.maxBytes', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent(
        'tenant_demo',
        {
          originalName: 'course.zip',
          contentType: 'application/zip',
          sizeBytes: 400 * 1024 * 1024
        },
        { maxBytes: 300 * 1024 * 1024, mimeAllowlist: new Set(['application/zip']) }
      )
    ).rejects.toMatchObject({ response: { code: 'file_too_large' } });
  });
});

describe('FilesService.getReadableFile', () => {
  it('returns storageKey and sizeBytes for a clean file', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'clean' });
    const meta = await service.getReadableFile('t1', 'file_abc');
    expect(meta.storageKey).toBe('submissions/t1/existing.pdf');
    expect(meta.sizeBytes).toBe(1024);
  });

  it('blocks an infected file with code file_infected (423)', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'infected' });
    await expect(service.getReadableFile('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_infected' }
    });
  });

  it('blocks a scan-errored file with code file_scan_failed', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'error' });
    await expect(service.getReadableFile('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_scan_failed' }
    });
  });

  it('throws file_not_found for a missing file', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await expect(service.getReadableFile('t1', 'missing')).rejects.toMatchObject({
      response: { code: 'file_not_found' }
    });
  });

  it('lazily scans a pending file then returns { storageKey, sizeBytes } when clean', async () => {
    const { service, scanner } = makeFilesService({
      antivirusStatus: 'pending',
      verdict: 'clean'
    });
    const meta = await service.getReadableFile('t1', 'file_abc');
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    expect(meta.storageKey).toBe('submissions/t1/existing.pdf');
    expect(meta.sizeBytes).toBe(1024);
  });

  it('lazily scans a pending file and throws file_infected when infected', async () => {
    const { service } = makeFilesService({ antivirusStatus: 'pending', verdict: 'infected' });
    await expect(service.getReadableFile('t1', 'file_abc')).rejects.toMatchObject({
      response: { code: 'file_infected' }
    });
  });
});

describe('FilesService.deleteFile', () => {
  it('deletes the object and soft-deletes the row', async () => {
    const { service, storage, queries, audit } = makeFilesService();
    await service.deleteFile('t1', 'file_x');
    expect(
      (storage as unknown as { deleteObject: ReturnType<typeof vi.fn> }).deleteObject
    ).toHaveBeenCalledWith({ key: 'submissions/t1/existing.pdf' });
    expect(queries.some((q) => q.sql.includes('set deleted_at = now()'))).toBe(true);
    expect((audit as unknown as { write: ReturnType<typeof vi.fn> }).write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'storage.file_deleted', entityId: 'file_x' })
    );
  });

  it('is idempotent when the row is already gone', async () => {
    const { service, storage } = makeFilesService({ emptyDb: true });
    await expect(service.deleteFile('t1', 'file_missing')).resolves.toBeUndefined();
    expect(
      (storage as unknown as { deleteObject: ReturnType<typeof vi.fn> }).deleteObject
    ).not.toHaveBeenCalled();
  });
});
