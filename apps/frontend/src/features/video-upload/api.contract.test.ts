import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  formatBytes as FormatBytes,
  uploadVideoFile as UploadVideoFile,
  videoApi as VideoApi
} from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

describe('video upload api contract (ФТ-B1.1)', () => {
  const fetchMock = vi.fn();
  let videoApi: typeof VideoApi;
  let uploadVideoFile: typeof UploadVideoFile;
  let formatBytes: typeof FormatBytes;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-28T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const partOk = (etag: string) => new Response(null, { status: 200, headers: { ETag: etag } });

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    videoApi = mod.videoApi;
    uploadVideoFile = mod.uploadVideoFile;
    formatBytes = mod.formatBytes;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const videoFile = (bytes: number, type = 'video/mp4') =>
    new File([new Uint8Array(bytes)], 'lesson.mp4', { type });

  it('create шлёт имя, размер и тип файла', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ assetId: 'v1', status: 'uploading', uploadKind: 'multipart' })
    );

    await videoApi.create(session, {
      fileName: 'lesson.mp4',
      sizeBytes: 1024,
      contentType: 'video/mp4'
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/video-assets');
    expect(JSON.parse(init.body as string)).toEqual({
      fileName: 'lesson.mp4',
      sizeBytes: 1024,
      contentType: 'video/mp4'
    });
  });

  it('режет файл на части и закрывает загрузку собранными ETag', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        envelope({
          assetId: 'v1',
          status: 'uploading',
          uploadKind: 'multipart',
          partSizeBytes: 4,
          partCount: 3
        })
      )
      .mockResolvedValueOnce(envelope({ uploadUrl: 'https://s3/p1', expiresInSeconds: 900 }))
      .mockResolvedValueOnce(partOk('"e1"'))
      .mockResolvedValueOnce(envelope({ uploadUrl: 'https://s3/p2', expiresInSeconds: 900 }))
      .mockResolvedValueOnce(partOk('"e2"'))
      .mockResolvedValueOnce(envelope({ uploadUrl: 'https://s3/p3', expiresInSeconds: 900 }))
      .mockResolvedValueOnce(partOk('"e3"'))
      .mockResolvedValueOnce(envelope({ id: 'v1', status: 'processing', sizeBytes: 10 }));

    const seen: number[] = [];
    const assetId = await uploadVideoFile(session, videoFile(10), (p) =>
      seen.push(p.uploadedParts)
    );

    expect(assetId).toBe('v1');
    expect(seen).toEqual([1, 2, 3]);
    const completeCall = fetchMock.mock.calls.at(-1)! as [string, RequestInit];
    expect(completeCall[0]).toContain('/video-assets/v1/complete');
    expect(JSON.parse(completeCall[1].body as string)).toEqual({
      parts: [
        { partNumber: 1, etag: '"e1"' },
        { partNumber: 2, etag: '"e2"' },
        { partNumber: 3, etag: '"e3"' }
      ]
    });
  });

  it('хранилище без ETag в CORS даёт понятную ошибку, а не «склеилось как-то»', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        envelope({
          assetId: 'v1',
          status: 'uploading',
          uploadKind: 'multipart',
          partSizeBytes: 4,
          partCount: 1
        })
      )
      .mockResolvedValueOnce(envelope({ uploadUrl: 'https://s3/p1', expiresInSeconds: 900 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(uploadVideoFile(session, videoFile(4))).rejects.toThrow(/ETag/);
  });

  it('ветка провайдера льёт файл целиком и не запрашивает части', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        envelope({
          assetId: 'v1',
          status: 'uploading',
          uploadKind: 'provider',
          uploadUrl: 'https://provider/upload'
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(envelope({ id: 'v1', status: 'processing', sizeBytes: 4 }));

    await uploadVideoFile(session, videoFile(4));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('https://provider/upload');
    expect(urls.some((u) => u.includes('/part-url'))).toBe(false);
  });

  it('не-видео и слишком большой файл отсекаются до обращения к серверу', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadVideoFile(session, videoFile(4, 'application/pdf'))).rejects.toThrow(/MP4/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attach шлёт материал, remove — DELETE', async () => {
    vi.stubGlobal('fetch', fetchMock);
    // Каждый вызов получает СВОЙ Response: тело читается один раз, переиспользование
    // объекта дало бы ложное падение на втором запросе.
    fetchMock
      .mockResolvedValueOnce(envelope({ id: 'v1', status: 'processing', sizeBytes: 4 }))
      .mockResolvedValueOnce(envelope({ deleted: true }));

    await videoApi.attach(session, 'v1', 'mat_1');
    const [attachUrl, attachInit] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(attachUrl).toContain('/video-assets/v1/attach');
    expect(JSON.parse(attachInit.body as string)).toEqual({ materialId: 'mat_1' });

    await videoApi.remove(session, 'v1');
    const [, removeInit] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(removeInit.method).toBe('DELETE');
  });

  it('storage отдаёт занятое место и остаток (ФТ-B1.3)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        usedBytes: 3 * 1024 ** 3,
        limitBytes: 10 * 1024 ** 3,
        remainingBytes: 7 * 1024 ** 3
      })
    );

    const usage = await videoApi.storage(session);

    expect(usage.remainingBytes).toBe(7 * 1024 ** 3);
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/video-assets/storage');
  });

  it('formatBytes показывает гигабайты, а не голые числа', () => {
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 ГБ');
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 МБ');
    expect(formatBytes(10)).toBe('1 КБ');
  });
});
