import { describe, expect, it, vi } from 'vitest';

import { FilesService } from './files.service.js';

import type { AntivirusScanner } from '../../infrastructure/antivirus/antivirus.scanner.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import type { AuditService } from '../audit/audit.service.js';

function makeFilesService(opts?: {
  antivirusStatus?: string;
  verdict?: 'clean' | 'infected' | 'error';
}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('select') && sql.includes('storage.files')) {
        return [
          {
            storage_key: 'submissions/t1/existing.pdf',
            antivirus_status: opts?.antivirusStatus ?? 'clean'
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
    getObjectStream: vi.fn()
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
