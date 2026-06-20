import { describe, expect, it, vi } from 'vitest';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentsService } from './payments.service.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';
import { NoopPaymentProvider } from '../../infrastructure/payments/payment.provider.js';

const ctx = { tenantId: 't1', userId: 'admin' } as any;
// Stub audit exposing the method(s) PaymentsService actually calls — match the real AuditService method name.
const auditStub = () => ({ write: vi.fn(), record: vi.fn(), writeCritical: vi.fn() }) as any;
const makeFulfillment = () => ({ fulfill: vi.fn().mockResolvedValue(undefined) });

const orderReq = {
  buyerType: 'learner' as const,
  buyerId: 'l1',
  description: 'Курс ОТ',
  items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 150000 }]
};

describe('PaymentsService', () => {
  it('creates an order in awaiting_payment with a computed total', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalAmount).toBe(150000);
  });
  it('mark-paid records a manual succeeded payment and runs fulfillment', async () => {
    const fulfillment = makeFulfillment();
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      fulfillment as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const updated = await svc.markPaid('t1', 'admin', order.id, { method: 'bank_transfer' }, ctx);
    expect(updated.status).toBe('paid');
    expect(fulfillment.fulfill).toHaveBeenCalledOnce();
  });
  it('mark-paid on an already-paid order throws and does not fulfill twice', async () => {
    const fulfillment = makeFulfillment();
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      fulfillment as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await svc.markPaid('t1', 'admin', order.id, {}, ctx);
    await expect(svc.markPaid('t1', 'admin', order.id, {}, ctx)).rejects.toThrow(
      /invalid_order_transition|already/
    );
    expect(fulfillment.fulfill).toHaveBeenCalledOnce();
  });
  it('pay with Noop provider throws payment_disabled', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await expect(svc.pay('t1', order.id, ctx)).rejects.toThrow(/payment_disabled/);
  });
  it('pay with Fake provider returns a confirmation url', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new FakePaymentProvider(),
      makeFulfillment() as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const res = await svc.pay('t1', order.id, ctx);
    expect(res.confirmationUrl).toContain(order.id);
  });
  it('cancel works from awaiting_payment, fails from paid', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub()
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const cancelled = await svc.cancelOrder('t1', 'admin', order.id, ctx);
    expect(cancelled.status).toBe('cancelled');
    const order2 = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await svc.markPaid('t1', 'admin', order2.id, {}, ctx);
    await expect(svc.cancelOrder('t1', 'admin', order2.id, ctx)).rejects.toThrow(/cannot_cancel/);
  });
});
