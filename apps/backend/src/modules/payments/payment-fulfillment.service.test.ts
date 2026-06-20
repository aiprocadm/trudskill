import { describe, expect, it, vi } from 'vitest';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';

const ctx = { tenantId: 't1', userId: 'admin' } as any;

function makeMvp(outcomeByCourse: Record<string, { learnerId: string; enrollmentId: string }[]>) {
  return {
    createBulkEnrollments: vi.fn(async (_t: string, _u: string, body: any) => ({
      rows: outcomeByCourse[body.courseVersionId].map((r) => ({
        learnerId: r.learnerId,
        enrollmentId: r.enrollmentId,
        status: 'created'
      }))
    }))
  };
}

async function seedPaidOrder(repo: InMemoryPaymentsRepository, items: any[]) {
  const order = await repo.createOrder({
    tenantId: 't1',
    buyerType: 'counterparty',
    buyerId: 'org1',
    currency: 'RUB',
    items
  });
  await repo.updateOrderStatus('t1', order.id, 'paid');
  return repo.getOrder('t1', order.id);
}

describe('PaymentFulfillmentService', () => {
  it('enrolls each item, marks items enrolled, sets order fulfilled', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 },
      { courseVersionId: 'cv1', learnerId: 'l2', unitAmount: 100 }
    ]);
    const mvp = makeMvp({
      cv1: [
        { learnerId: 'l1', enrollmentId: 'e1' },
        { learnerId: 'l2', enrollmentId: 'e2' }
      ]
    });
    const svc = new PaymentFulfillmentService(repo, mvp as any);
    await svc.fulfill(order!, ctx);
    expect(mvp.createBulkEnrollments).toHaveBeenCalledOnce();
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('fulfilled');
    expect(after!.items.every((i) => i.fulfillmentStatus === 'enrolled')).toBe(true);
    expect(after!.items.map((i) => i.enrollmentId).sort()).toEqual(['e1', 'e2']);
  });

  it('is idempotent — re-running does not double-enroll', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }
    ]);
    const mvp = makeMvp({ cv1: [{ learnerId: 'l1', enrollmentId: 'e1' }] });
    const svc = new PaymentFulfillmentService(repo, mvp as any);
    await svc.fulfill(order!, ctx);
    const reloaded = await repo.getOrder('t1', order!.id);
    await svc.fulfill(reloaded!, ctx);
    expect(mvp.createBulkEnrollments).toHaveBeenCalledOnce();
  });

  it('fail-soft — enrollment error leaves order paid, never throws', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }
    ]);
    const mvp = { createBulkEnrollments: vi.fn().mockRejectedValue(new Error('db down')) };
    const svc = new PaymentFulfillmentService(repo, mvp as any);
    await expect(svc.fulfill(order!, ctx)).resolves.toBeUndefined();
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('paid');
    expect(after!.items[0]!.fulfillmentStatus).toBe('pending');
  });
});
