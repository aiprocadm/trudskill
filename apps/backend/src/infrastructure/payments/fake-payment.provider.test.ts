import { describe, expect, it } from 'vitest';

import { FakePaymentProvider } from './fake-payment.provider.js';

describe('FakePaymentProvider', () => {
  it('returns a synthetic confirmation url + pending status', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс ОТ'
    });
    expect(provider.id).toBe('fake');
    expect(result.status).toBe('pending');
    expect(result.providerPaymentId).toMatch(/^fake-pay:/);
    expect(result.confirmationUrl).toContain('o1');
  });
  it('parses a fake webhook into a succeeded event', async () => {
    const provider = new FakePaymentProvider();
    const raw = Buffer.from(
      JSON.stringify({ providerPaymentId: 'fake-pay:o1', status: 'succeeded' })
    );
    const event = await provider.parseWebhook(raw, {});
    expect(event).toEqual({
      providerPaymentId: 'fake-pay:o1',
      status: 'succeeded',
      rawPayload: { providerPaymentId: 'fake-pay:o1', status: 'succeeded' }
    });
  });
  it('returns null for an unparseable webhook body', async () => {
    const provider = new FakePaymentProvider();
    const event = await provider.parseWebhook(Buffer.from('not-json'), {});
    expect(event).toBeNull();
  });
});
