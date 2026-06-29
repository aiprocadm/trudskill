import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { TenantSerialGateway } from '../../infrastructure/request/tenant-serial.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { InMemoryMvpState } from '../mvp/infrastructure/in-memory-mvp.state.js';
import { MemoryMvpPersistenceBackend } from '../mvp/infrastructure/memory-mvp-persistence.backend.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import { MvpEnrollmentService } from '../mvp/mvp-enrollment.service.js';

const ctx = { tenantId: 't1', userId: 'admin' } as any;

function makeEnrollment(byGroup: Record<string, { learnerId: string; enrollmentId: string }[]>) {
  return {
    enrollIntoGroup: vi.fn(async (_t: string, _u: string, body: any) => ({
      groupId: body.groupId,
      idempotencyKey: body.idempotencyKey,
      created: byGroup[body.groupId].map((r) => ({ id: r.enrollmentId, learnerId: r.learnerId })),
      skippedExisting: [],
      errors: []
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
      { groupId: 'g1', learnerId: 'l1', unitAmount: 100 },
      { groupId: 'g1', learnerId: 'l2', unitAmount: 100 }
    ]);
    const enrollment = makeEnrollment({
      g1: [
        { learnerId: 'l1', enrollmentId: 'e1' },
        { learnerId: 'l2', enrollmentId: 'e2' }
      ]
    });
    const svc = new PaymentFulfillmentService(repo, enrollment as any);
    await svc.fulfill(order!, ctx);
    expect(enrollment.enrollIntoGroup).toHaveBeenCalledOnce();
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('fulfilled');
    expect(after!.items.every((i) => i.fulfillmentStatus === 'enrolled')).toBe(true);
    expect(after!.items.map((i) => i.enrollmentId).sort()).toEqual(['e1', 'e2']);
  });

  it('is idempotent — re-running does not double-enroll', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [{ groupId: 'g1', learnerId: 'l1', unitAmount: 100 }]);
    const enrollment = makeEnrollment({ g1: [{ learnerId: 'l1', enrollmentId: 'e1' }] });
    const svc = new PaymentFulfillmentService(repo, enrollment as any);
    await svc.fulfill(order!, ctx);
    const reloaded = await repo.getOrder('t1', order!.id);
    await svc.fulfill(reloaded!, ctx);
    expect(enrollment.enrollIntoGroup).toHaveBeenCalledOnce();
  });

  it('partial fulfillment keeps the order paid and never marks an un-enrolled item', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { groupId: 'g1', learnerId: 'l1', unitAmount: 100 },
      { groupId: 'g1', learnerId: 'l2', unitAmount: 100 }
    ]);
    // l1 enrolls; l2 fails (absent from created/skippedExisting — surfaced in errors).
    const enrollment = {
      enrollIntoGroup: vi.fn(async (_t: string, _u: string, body: any) => ({
        groupId: body.groupId,
        idempotencyKey: body.idempotencyKey,
        created: [{ id: 'e1', learnerId: 'l1' }],
        skippedExisting: [],
        errors: [{ learnerId: 'l2', error: 'group full' }]
      }))
    };
    const svc = new PaymentFulfillmentService(repo, enrollment as any);
    await svc.fulfill(order!, ctx);

    const after = await repo.getOrder('t1', order!.id);
    // A seat is missing → the order must NOT be reported fulfilled (retry-able at 'paid').
    expect(after!.status).toBe('paid');
    const l1 = after!.items.find((i) => i.learnerId === 'l1')!;
    const l2 = after!.items.find((i) => i.learnerId === 'l2')!;
    expect(l1.fulfillmentStatus).toBe('enrolled');
    expect(l1.enrollmentId).toBe('e1');
    // l2 stays pending — never 'enrolled' with a null enrollmentId.
    expect(l2.fulfillmentStatus).toBe('pending');
    expect(l2.enrollmentId).toBeUndefined();
  });

  it('retry re-enrolls a learner that failed transiently, then fulfills the order (real enrollment path)', async () => {
    // Real enrollment stack over a seeded Postgres-equivalent snapshot: group g1 + learner l1.
    // l2 is intentionally MISSING so it fails NotFound on the first fulfillment pass.
    const backend = new MemoryMvpPersistenceBackend();
    const seed = new InMemoryMvpState();
    const now = '2026-01-01T00:00:00.000Z';
    seed.groups.push({
      id: 'g1',
      tenantId: 't1',
      name: 'Группа 1',
      status: 'active',
      createdAt: now,
      updatedAt: now
    } as never);
    seed.learners.push({
      id: 'l1',
      tenantId: 't1',
      fullName: 'Иванов Иван',
      status: 'active',
      createdAt: now,
      updatedAt: now
    } as never);
    await backend.saveFromState('t1', seed);

    const enrollment = new MvpEnrollmentService(
      new MvpTenantRunner(backend, new TenantSerialGateway()),
      new TenantScopedRepository(),
      new AuditService(),
      new EventEmitter2()
    );
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { groupId: 'g1', learnerId: 'l1', unitAmount: 100 },
      { groupId: 'g1', learnerId: 'l2', unitAmount: 100 }
    ]);
    const svc = new PaymentFulfillmentService(repo, enrollment);

    // First pass: l1 enrolls, l2 fails NotFound → order stays 'paid', l2 item stays 'pending'.
    await svc.fulfill(order!, ctx);
    const afterFirst = await repo.getOrder('t1', order!.id);
    expect(afterFirst!.status).toBe('paid');
    expect(afterFirst!.items.find((i) => i.learnerId === 'l1')!.fulfillmentStatus).toBe('enrolled');
    expect(afterFirst!.items.find((i) => i.learnerId === 'l2')!.fulfillmentStatus).toBe('pending');

    // The transient cause is fixed: l2 now exists in the persisted snapshot.
    const snapshot = new InMemoryMvpState();
    await backend.loadIntoState('t1', snapshot);
    snapshot.learners.push({
      id: 'l2',
      tenantId: 't1',
      fullName: 'Петров Пётр',
      status: 'active',
      createdAt: now,
      updatedAt: now
    } as never);
    await backend.saveFromState('t1', snapshot);

    // Retry fulfillment with the SAME order id (same deterministic idempotency key):
    // l2 must now be enrolled and the order fulfilled.
    await svc.fulfill(afterFirst!, ctx);
    const afterRetry = await repo.getOrder('t1', order!.id);
    expect(afterRetry!.items.find((i) => i.learnerId === 'l2')!.fulfillmentStatus).toBe('enrolled');
    expect(afterRetry!.items.every((i) => i.fulfillmentStatus === 'enrolled')).toBe(true);
    expect(afterRetry!.status).toBe('fulfilled');

    // Exactly two enrollments persisted — l1 was not duplicated on retry.
    const persisted = new InMemoryMvpState();
    await backend.loadIntoState('t1', persisted);
    expect(persisted.enrollments.map((e) => e.learnerId).sort()).toEqual(['l1', 'l2']);
  });

  it('fail-soft — enrollment error leaves order paid, never throws', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [{ groupId: 'g1', learnerId: 'l1', unitAmount: 100 }]);
    const enrollment = {
      enrollIntoGroup: vi.fn().mockRejectedValue(new Error('db down'))
    };
    const svc = new PaymentFulfillmentService(repo, enrollment as any);
    await expect(svc.fulfill(order!, ctx)).resolves.toBeUndefined();
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('paid');
    expect(after!.items[0]!.fulfillmentStatus).toBe('pending');
  });
});
