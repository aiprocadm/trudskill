import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  getVideoProviderSettings as GetVideoProviderSettings,
  saveVideoProviderSettings as SaveVideoProviderSettings
} from './provider-settings.api';

/**
 * Контракт настройки видеопоставщика (журнал 309). До этой ручки право `video.configure`
 * не проверял никто, а разрешитель всегда отдавал `noop` — включить видео было нельзя.
 */
const envelope = <T>(data: T) =>
  JSON.stringify({ data, meta: { requestId: 'r', correlationId: 'c', timestamp: 't' } });

describe('video provider settings api', () => {
  let getVideoProviderSettings: typeof GetVideoProviderSettings;
  let saveVideoProviderSettings: typeof SaveVideoProviderSettings;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./provider-settings.api');
    getVideoProviderSettings = mod.getVideoProviderSettings;
    saveVideoProviderSettings = mod.saveVideoProviderSettings;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('чтение разворачивает конверт и идёт на адрес ручки', async () => {
    const spy = vi.fn(
      async () =>
        new Response(
          envelope({
            tenantId: 't1',
            providerCode: 'noop',
            enabled: false,
            updatedAt: '1970-01-01T00:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', spy);

    const result = await getVideoProviderSettings();

    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/video/provider-settings');
    expect(result.providerCode).toBe('noop');
  });

  it('сохранение уходит методом PUT и несёт адрес установки', async () => {
    const spy = vi.fn(
      async () =>
        new Response(
          envelope({
            tenantId: 't1',
            providerCode: 'kinescope',
            baseUrl: 'https://api.kinescope.io',
            enabled: true,
            updatedAt: '2026-08-30T00:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', spy);

    const result = await saveVideoProviderSettings({
      providerCode: 'kinescope',
      baseUrl: 'https://api.kinescope.io',
      enabled: true
    });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/video/provider-settings');
    expect(init.method).toBe('PUT');
    expect(String(init.body)).toContain('kinescope.io');
    expect(result.enabled).toBe(true);
  });
});
