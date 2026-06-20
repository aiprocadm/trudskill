import { describe, expect, it } from 'vitest';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';

const seed = {
  tenantId: 't1',
  buyerType: 'learner' as const,
  buyerId: 'l1',
  currency: 'RUB',
  description: 'Курс ОТ',
  createdBy: 'admin',
  items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 150000 }]
};

describe('InMemoryPaymentsRepository', () => {
  it('creates an order with computed total + awaiting_payment status', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalAmount).toBe(150000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.fulfillmentStatus).toBe('pending');
  });
  it('reads back by id within tenant, isolates across tenants', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    expect(await repo.getOrder('t1', order.id)).not.toBeNull();
    expect(await repo.getOrder('t2', order.id)).toBeNull();
  });
  it('records a payment and finds the order by provider_payment_id', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    await repo.createPayment({
      tenantId: 't1',
      orderId: order.id,
      provider: 'fake',
      providerPaymentId: 'fake-pay:x',
      method: 'card',
      amount: 150000,
      status: 'pending'
    });
    const found = await repo.findOrderByProviderPaymentId('fake-pay:x');
    expect(found?.order.id).toBe(order.id);
    expect(found?.tenantId).toBe('t1');
  });
  it('updates order status', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    await repo.updateOrderStatus('t1', order.id, 'paid');
    expect((await repo.getOrder('t1', order.id))!.status).toBe('paid');
  });
});
