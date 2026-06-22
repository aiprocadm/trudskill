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
  // CloudPayments delivers webhooks as application/x-www-form-urlencoded
  const raw = Buffer.from('TransactionId=555&Status=Completed', 'utf8');
  const goodHmac = createHmac('sha256', cfg.apiSecret).update(raw).digest('base64');

  it('verifies Content-HMAC and maps Completed → succeeded', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(raw, { 'content-hmac': goodHmac });
    expect(ev).toMatchObject({ providerPaymentId: '555', status: 'succeeded' });
  });
  it('rawPayload is the form-field object', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(raw, { 'content-hmac': goodHmac });
    expect(ev?.rawPayload).toEqual({ TransactionId: '555', Status: 'Completed' });
  });
  it('maps Authorized → succeeded', async () => {
    const rawAuth = Buffer.from('TransactionId=556&Status=Authorized', 'utf8');
    const hmac = createHmac('sha256', cfg.apiSecret).update(rawAuth).digest('base64');
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(rawAuth, { 'content-hmac': hmac });
    expect(ev).toMatchObject({ providerPaymentId: '556', status: 'succeeded' });
  });
  it('maps Cancelled → cancelled', async () => {
    const rawCancelled = Buffer.from('TransactionId=557&Status=Cancelled', 'utf8');
    const hmac = createHmac('sha256', cfg.apiSecret).update(rawCancelled).digest('base64');
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(rawCancelled, { 'content-hmac': hmac });
    expect(ev).toMatchObject({ providerPaymentId: '557', status: 'cancelled' });
  });
  it('returns null on a bad HMAC', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(await p.parseWebhook(raw, { 'content-hmac': 'nope' })).toBeNull();
  });
  it('returns null when the Content-HMAC header is absent', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(await p.parseWebhook(raw, {})).toBeNull();
  });
  it('acks with {code:0}', () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(p.webhookAck()).toEqual({ code: 0 });
  });
});
