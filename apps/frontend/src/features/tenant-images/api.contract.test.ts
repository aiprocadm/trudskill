import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { putTenantImage as PutTenantImage, tenantImagesApi as TenantImagesApi } from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

describe('tenant images api contract (ФТ-A7.1)', () => {
  const fetchMock = vi.fn();
  let tenantImagesApi: typeof TenantImagesApi;
  let putTenantImage: typeof PutTenantImage;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-27T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    tenantImagesApi = mod.tenantImagesApi;
    putTenantImage = mod.putTenantImage;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list разворачивает конверт и отдаёт слоты', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ images: { stamp: { fileId: 'file_1', widthMm: 30 } } })
    );

    const result = await tenantImagesApi.list(session);

    expect(result.images.stamp?.fileId).toBe('file_1');
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant-images');
  });

  it('uploadUrl передаёт тип содержимого — им же подписывается интент', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        fileId: 'f1',
        uploadUrl: 'https://s3/PUT',
        storageKey: 'k',
        expiresInSeconds: 900
      })
    );

    await tenantImagesApi.uploadUrl(session, {
      originalName: 'stamp.png',
      sizeBytes: 1024,
      contentType: 'image/png'
    });

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      originalName: 'stamp.png',
      sizeBytes: 1024,
      contentType: 'image/png'
    });
  });

  it('save шлёт PUT на конкретный слот; fileId=null убирает картинку', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ images: {} }));

    await tenantImagesApi.save(session, 'signature', { fileId: null });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant-images/signature');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ fileId: null });
  });

  it('putTenantImage шлёт файл в хранилище тем же Content-Type, что и интент', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await putTenantImage('https://s3/PUT', new File(['x'], 'stamp.png'), 'image/png');

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://s3/PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('ошибка хранилища становится понятной ошибкой, а не тихим успехом', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(
      putTenantImage('https://s3/PUT', new File(['x'], 'stamp.png'), 'image/png')
    ).rejects.toThrow(/403/);
  });
});
