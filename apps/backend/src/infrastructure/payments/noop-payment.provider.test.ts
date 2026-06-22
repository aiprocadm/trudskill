import { describe, expect, it } from 'vitest';

import { NoopPaymentProvider } from './payment.provider.js';

describe('NoopPaymentProvider', () => {
  it('reports disabled and never produces a confirmation url', async () => {
    const provider = new NoopPaymentProvider();
    const result = await provider.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс ОТ'
    });
    expect(provider.code).toBe('noop');
    expect(result.status).toBe('disabled');
    expect(result.confirmationUrl).toBeUndefined();
  });
  it('parses no webhook event (no-op)', async () => {
    const provider = new NoopPaymentProvider();
    const event = await provider.parseWebhook(Buffer.from('{}'), {});
    expect(event).toBeNull();
  });
});
