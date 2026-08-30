import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  getSmsProviderSettings as GetSmsProviderSettings,
  saveSmsProviderSettings as SaveSmsProviderSettings
} from './api';

/**
 * Контракт настройки СМС-поставщика (журнал 309). Ручка появилась вместе с этим экраном:
 * до неё право `sms.configure` не давало ничего, а второй канал доставки (ФТ-C1.3) нельзя
 * было включить.
 */
const envelope = <T>(data: T) =>
  JSON.stringify({ data, meta: { requestId: 'r', correlationId: 'c', timestamp: 't' } });

describe('sms provider settings api', () => {
  let getSmsProviderSettings: typeof GetSmsProviderSettings;
  let saveSmsProviderSettings: typeof SaveSmsProviderSettings;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    getSmsProviderSettings = mod.getSmsProviderSettings;
    saveSmsProviderSettings = mod.saveSmsProviderSettings;
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

    const result = await getSmsProviderSettings();

    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sms/provider-settings');
    expect(result.providerCode).toBe('noop');
    expect(result.enabled).toBe(false);
  });

  it('сохранение уходит методом PUT и несёт имя отправителя', async () => {
    const spy = vi.fn(
      async () =>
        new Response(
          envelope({
            tenantId: 't1',
            providerCode: 'smsc',
            senderName: 'TRUDSKILL',
            enabled: true,
            updatedAt: '2026-08-30T00:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', spy);

    const result = await saveSmsProviderSettings({
      providerCode: 'smsc',
      senderName: 'TRUDSKILL',
      enabled: true
    });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sms/provider-settings');
    expect(init.method).toBe('PUT');
    expect(String(init.body)).toContain('TRUDSKILL');
    expect(result.enabled).toBe(true);
  });
});
