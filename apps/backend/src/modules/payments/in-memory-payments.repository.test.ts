import { describe, expect, it } from 'vitest';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';

const seed = {
  tenantId: 't1',
  buyerType: 'learner' as const,
  buyerId: 'l1',
  currency: 'RUB',
  description: 'Курс ОТ',
  createdBy: 'admin',
  items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 150000 }]
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
  it('scopes provider_payment_id lookup by provider to avoid cross-provider collisions', async () => {
    const repo = new InMemoryPaymentsRepository();
    // Two providers happen to mint the same short id (e.g. Robokassa numeric InvId vs another).
    const roboOrder = await repo.createOrder(seed);
    await repo.createPayment({
      tenantId: 't1',
      orderId: roboOrder.id,
      provider: 'robokassa',
      providerPaymentId: '42',
      method: 'card',
      amount: 150000,
      status: 'pending'
    });
    const tinkoffOrder = await repo.createOrder({ ...seed, buyerId: 'l2' });
    await repo.createPayment({
      tenantId: 't1',
      orderId: tinkoffOrder.id,
      provider: 'tinkoff',
      providerPaymentId: '42',
      method: 'card',
      amount: 150000,
      status: 'pending'
    });

    const robo = await repo.findOrderByProviderPaymentId('42', 'robokassa');
    expect(robo?.order.id).toBe(roboOrder.id);
    expect(robo?.payment.provider).toBe('robokassa');

    const tinkoff = await repo.findOrderByProviderPaymentId('42', 'tinkoff');
    expect(tinkoff?.order.id).toBe(tinkoffOrder.id);
    expect(tinkoff?.payment.provider).toBe('tinkoff');
  });
  it('updates order status', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    await repo.updateOrderStatus('t1', order.id, 'paid');
    expect((await repo.getOrder('t1', order.id))!.status).toBe('paid');
  });
});
