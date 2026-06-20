import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MemoryMvpPersistenceBackend } from './infrastructure/memory-mvp-persistence.backend.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { MvpEnrollmentService } from './mvp-enrollment.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { TenantSerialGateway } from '../../infrastructure/request/tenant-serial.gateway.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const TENANT = 't1';
const ctx: RequestContext = { requestId: 'req1', correlationId: 'corr1' };

/**
 * KEY regression test for the CRITICAL fulfillment bug: enrolling outside an HTTP request must
 * hydrate tenant MVP state from persistence and SAVE the mutation. We seed a Postgres-equivalent
 * snapshot (MemoryMvpPersistenceBackend) with one group + one learner, run enrollIntoGroup over a
 * REAL MvpTenantRunner + REAL MvpService, then assert (a) the outcome created the enrollment and
 * (b) the persisted snapshot reflects it (so a subsequent request would see the enrollment).
 */
function seedBackend(): MemoryMvpPersistenceBackend {
  const backend = new MemoryMvpPersistenceBackend();
  const seed = new InMemoryMvpState();
  const now = '2026-01-01T00:00:00.000Z';
  seed.groups.push({
    id: 'g1',
    tenantId: TENANT,
    name: 'Группа 1',
    status: 'active',
    createdAt: now,
    updatedAt: now
  } as never);
  seed.learners.push({
    id: 'l1',
    tenantId: TENANT,
    fullName: 'Иванов Иван',
    status: 'active',
    createdAt: now,
    updatedAt: now
  } as never);
  // Persist the seed as the tenant's stored snapshot.
  void backend.saveFromState(TENANT, seed);
  return backend;
}

function makeService(backend: MemoryMvpPersistenceBackend): MvpEnrollmentService {
  const runner = new MvpTenantRunner(backend, new TenantSerialGateway());
  return new MvpEnrollmentService(
    runner,
    new TenantScopedRepository(),
    new AuditService(),
    new EventEmitter2()
    // LicensesService omitted (@Optional in both MvpEnrollmentService and MvpService).
  );
}

describe('MvpEnrollmentService.enrollIntoGroup (CRITICAL: hydrates + saves outside a request)', () => {
  it('creates the enrollment over a real MvpService and persists it to the snapshot', async () => {
    const backend = seedBackend();
    const svc = makeService(backend);

    const outcome = await svc.enrollIntoGroup(
      TENANT,
      'system',
      { idempotencyKey: 'payment:o1:g1', groupId: 'g1', learnerIds: ['l1'] },
      ctx
    );

    // (a) outcome reflects the created enrollment
    expect(outcome.created).toHaveLength(1);
    expect(outcome.created[0]!.learnerId).toBe('l1');
    expect(outcome.created[0]!.groupId).toBe('g1');
    expect(outcome.errors).toEqual([]);

    // (b) the mutation was SAVED — reloading the snapshot shows the enrollment persisted
    const reloaded = new InMemoryMvpState();
    await backend.loadIntoState(TENANT, reloaded);
    expect(reloaded.enrollments).toHaveLength(1);
    expect(reloaded.enrollments[0]!.learnerId).toBe('l1');
    expect(reloaded.enrollments[0]!.id).toBe(outcome.created[0]!.id);
  });

  it('is idempotent — re-running with the same key returns the cached outcome without duplicating', async () => {
    const backend = seedBackend();
    const svc = makeService(backend);
    const req = { idempotencyKey: 'payment:o1:g1', groupId: 'g1', learnerIds: ['l1'] };

    const first = await svc.enrollIntoGroup(TENANT, 'system', req, ctx);
    const second = await svc.enrollIntoGroup(TENANT, 'system', req, ctx);

    expect(second.created[0]!.id).toBe(first.created[0]!.id);
    const reloaded = new InMemoryMvpState();
    await backend.loadIntoState(TENANT, reloaded);
    expect(reloaded.enrollments).toHaveLength(1);
  });
});
