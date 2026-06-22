import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { CloudPaymentsProvider } from './cloudpayments-payment.provider.js';

const cfg = { publicId: 'pid', apiSecret: 'secret', apiBase: 'https://api.cloudpayments.ru' };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('CloudPaymentsProvider.createPayment', () => {
  it('creates an order with major-unit amount + Basic auth; returns Model.Url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Success: true, Model: { Id: 'cp-1', Url: 'https://pay/cp-1' } })
      );
    const p = new CloudPaymentsProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: 'cp-1',
      status: 'pending',
      confirmationUrl: 'https://pay/cp-1'
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudpayments.ru/orders/create');
    expect((init as any).headers.Authorization).toBe(
      'Basic ' + Buffer.from('pid:secret').toString('base64')
    );
    const body = JSON.parse((init as any).body);
    expect(body.Amount).toBe(1500);
  });
});

describe('CloudPaymentsProvider.parseWebhook', () => {
  const payload = { TransactionId: 555, Status: 'Completed' };
  const raw = Buffer.from(JSON.stringify(payload));
  const goodHmac = createHmac('sha256', cfg.apiSecret).update(raw).digest('base64');

  it('verifies Content-HMAC and maps Completed → succeeded', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(raw, { 'content-hmac': goodHmac });
    expect(ev).toMatchObject({ providerPaymentId: '555', status: 'succeeded' });
  });
  it('returns null on a bad HMAC', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(await p.parseWebhook(raw, { 'content-hmac': 'nope' })).toBeNull();
  });
  it('acks with {code:0}', () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(p.webhookAck()).toEqual({ code: 0 });
  });
});
