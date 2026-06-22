// apps/backend/src/infrastructure/payments/yookassa-payment.provider.test.ts
import { describe, expect, it, vi } from 'vitest';

import { YookassaPaymentProvider } from './yookassa-payment.provider.js';

const cfg = {
  shopId: 'shop-1',
  secretKey: 'sk-test',
  returnUrl: 'https://lms.example.ru/return',
  apiBase: 'https://api.yookassa.ru/v3',
  allowedIps: ['185.71.76.0/27'],
  ipCheckEnabled: false
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('YookassaPaymentProvider.createPayment', () => {
  it('POSTs amount in rubles, Basic auth + Idempotence-Key, returns confirmationUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'yk-1',
        status: 'pending',
        confirmation: { confirmation_url: 'https://pay/yk-1' }
      })
    );
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: 'yk-1',
      status: 'pending',
      confirmationUrl: 'https://pay/yk-1'
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.yookassa.ru/v3/payments');
    expect((init as any).headers['Idempotence-Key']).toBe('o1');
    expect((init as any).headers.Authorization).toBe(
      'Basic ' + Buffer.from('shop-1:sk-test').toString('base64')
    );
    const body = JSON.parse((init as any).body);
    expect(body.amount).toEqual({ value: '1500.00', currency: 'RUB' });
    expect(body.confirmation.return_url).toBe(cfg.returnUrl);
  });

  it('throws on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ type: 'error' }, false, 400));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    await expect(
      p.createPayment({
        tenantId: 't1',
        orderId: 'o1',
        amount: 100,
        currency: 'RUB',
        description: 'x'
      })
    ).rejects.toThrow();
  });
});

describe('YookassaPaymentProvider.parseWebhook', () => {
  const notif = (id: string) =>
    Buffer.from(
      JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id } })
    );

  it('re-fetches the payment and trusts the API status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'succeeded' }));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const ev = await p.parseWebhook(notif('yk-1'), {});
    expect(ev).toMatchObject({ providerPaymentId: 'yk-1', status: 'succeeded' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.yookassa.ru/v3/payments/yk-1');
  });

  it('returns null when the API says the payment is still pending (spoofed body)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'pending' }));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    expect(await p.parseWebhook(notif('yk-1'), {})).toBeNull();
  });

  it('returns null for an unknown event', async () => {
    const p = new YookassaPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(
      await p.parseWebhook(
        Buffer.from(JSON.stringify({ type: 'notification', event: 'x', object: { id: 'a' } })),
        {}
      )
    ).toBeNull();
  });

  it('drops a notification from a non-allowlisted IP when IP check is on', async () => {
    const fetchMock = vi.fn();
    const p = new YookassaPaymentProvider(
      { ...cfg, ipCheckEnabled: true },
      fetchMock as unknown as typeof fetch
    );
    expect(await p.parseWebhook(notif('yk-1'), { 'x-forwarded-for': '8.8.8.8' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admits an allowlisted IPv4 and proceeds to re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'succeeded' }));
    const p = new YookassaPaymentProvider(
      { ...cfg, ipCheckEnabled: true },
      fetchMock as unknown as typeof fetch
    );
    const ev = await p.parseWebhook(notif('yk-1'), { 'x-forwarded-for': '185.71.76.5' });
    expect(ev).toMatchObject({ providerPaymentId: 'yk-1', status: 'succeeded' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through to re-fetch for an IPv6 source (IPv4-only allowlist)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'succeeded' }));
    const p = new YookassaPaymentProvider(
      { ...cfg, ipCheckEnabled: true },
      fetchMock as unknown as typeof fetch
    );
    const ev = await p.parseWebhook(notif('yk-1'), { 'x-forwarded-for': '2a02:5180::1' });
    expect(ev).toMatchObject({ providerPaymentId: 'yk-1', status: 'succeeded' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
