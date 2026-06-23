import { describe, expect, it, vi } from 'vitest';

import { PaymentsWebhookController } from './payments-webhook.controller.js';

import type { WebhookEvent } from '../../infrastructure/payments/payment.provider.js';

/**
 * Unit tests for the unguarded webhook controller's safety checks: provider-scoped lookup and the
 * amount cross-check. Instantiates the controller directly with stubs (no Nest boot).
 */

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    sent: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    type() {
      return res;
    },
    send(b: unknown) {
      res.body = b;
      res.sent = true;
    },
    json(b: unknown) {
      res.body = b;
      res.sent = true;
    }
  };
  return res;
}

const order = {
  id: 'ord1',
  tenantId: 't1',
  status: 'awaiting_payment',
  createdBy: 'admin'
} as any;

function makeDeps(opts: { event: WebhookEvent; paymentAmount: number; paymentProvider?: string }) {
  const payment = {
    id: 'pay1',
    provider: opts.paymentProvider ?? 'tinkoff',
    amount: opts.paymentAmount,
    status: 'pending'
  } as any;

  const provider = {
    code: 'tinkoff',
    parseWebhook: vi.fn().mockResolvedValue(opts.event),
    webhookAck: vi.fn().mockReturnValue('OK')
  };
  const resolver = { fromRegistry: vi.fn().mockReturnValue(provider) } as any;

  const repo = {
    findOrderByProviderPaymentId: vi.fn().mockResolvedValue({ tenantId: 't1', order, payment }),
    updatePaymentStatus: vi.fn().mockResolvedValue(undefined),
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    getOrder: vi.fn().mockResolvedValue({ ...order, status: 'paid' })
  } as any;

  const fulfillment = { fulfill: vi.fn().mockResolvedValue(undefined) } as any;

  const controller = new PaymentsWebhookController(resolver, repo, fulfillment);
  return { controller, repo, fulfillment, provider };
}

const req = { rawBody: Buffer.from('{}'), body: {} } as any;

describe('PaymentsWebhookController', () => {
  it('scopes the order lookup to the webhook provider code', async () => {
    const { controller, repo } = makeDeps({
      event: { providerPaymentId: '42', status: 'succeeded', amount: 150000, rawPayload: {} },
      paymentAmount: 150000
    });
    await controller.handle('tinkoff', req, {}, makeRes());
    expect(repo.findOrderByProviderPaymentId).toHaveBeenCalledWith('42', 'tinkoff');
  });

  it('fulfills when the verified amount matches the stored payment', async () => {
    const { controller, fulfillment } = makeDeps({
      event: { providerPaymentId: '42', status: 'succeeded', amount: 150000, rawPayload: {} },
      paymentAmount: 150000
    });
    await controller.handle('tinkoff', req, {}, makeRes());
    expect(fulfillment.fulfill).toHaveBeenCalledTimes(1);
  });

  it('does NOT fulfill when the verified amount mismatches the stored payment', async () => {
    const { controller, fulfillment, repo } = makeDeps({
      event: { providerPaymentId: '42', status: 'succeeded', amount: 999, rawPayload: {} },
      paymentAmount: 150000
    });
    const res = makeRes();
    await controller.handle('tinkoff', req, {}, res);
    expect(fulfillment.fulfill).not.toHaveBeenCalled();
    expect(repo.updatePaymentStatus).not.toHaveBeenCalled();
    // Still ACKs so the acquirer stops retrying.
    expect(res.sent).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('does NOT fulfill when the stored payment belongs to another provider', async () => {
    const { controller, fulfillment } = makeDeps({
      event: { providerPaymentId: '42', status: 'succeeded', amount: 150000, rawPayload: {} },
      paymentAmount: 150000,
      paymentProvider: 'robokassa'
    });
    await controller.handle('tinkoff', req, {}, makeRes());
    expect(fulfillment.fulfill).not.toHaveBeenCalled();
  });

  it('fulfills when the adapter surfaces no amount (cross-check skipped)', async () => {
    const { controller, fulfillment } = makeDeps({
      event: { providerPaymentId: '42', status: 'succeeded', rawPayload: {} },
      paymentAmount: 150000
    });
    await controller.handle('tinkoff', req, {}, makeRes());
    expect(fulfillment.fulfill).toHaveBeenCalledTimes(1);
  });
});
