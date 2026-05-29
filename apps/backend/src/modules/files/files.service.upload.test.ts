import { describe, expect, it, vi } from 'vitest';

import { FilesService } from './files.service.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

function makeFilesService() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('select') && sql.includes('storage.files')) {
        return [{ storage_key: 'submissions/t1/existing.pdf' }];
      }
      return [];
    }),
    withTransaction: vi.fn()
  } as unknown as DatabaseService;
  const storage = {
    createPresignedUploadUrl: vi.fn(async () => 'https://minio.local/PUT-signed'),
    createPresignedDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed')
  } as unknown as S3StorageClient;
  return { service: new FilesService(db, storage), db, storage, queries };
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

describe('FilesService.createDownloadUrl', () => {
  it('returns a presigned GET url for a tenant-owned file', async () => {
    const { service, storage } = makeFilesService();
    const url = await service.createDownloadUrl('t1', 'file_abc');
    expect(url).toBe('https://minio.local/GET-signed');
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
      key: 'submissions/t1/existing.pdf'
    });
  });

  it('throws when the file is not found for the tenant', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await expect(service.createDownloadUrl('t1', 'missing')).rejects.toMatchObject({
      response: { code: 'file_not_found' }
    });
  });
});
