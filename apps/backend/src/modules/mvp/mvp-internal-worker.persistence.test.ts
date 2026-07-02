import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MemoryMvpPersistenceBackend } from './infrastructure/memory-mvp-persistence.backend.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { MvpEnrollmentService } from './mvp-enrollment.service.js';
import { MvpInternalWorkerController } from './mvp-internal-worker.controller.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { TenantSerialGateway } from '../../infrastructure/request/tenant-serial.gateway.js';
import { AuditService } from '../audit/audit.service.js';

const TENANT = 't_worker';

/**
 * Regression for the queued-bulk-enrollment data-loss bug: the worker callback runs OUTSIDE an
 * HTTP request and is NOT wrapped by MvpRequestPersistenceInterceptor, so a request-scoped
 * MvpService would see an EMPTY MVP_STATE — every learner would fail `not_found`, the callback
 * would return an all-errors 200, the worker would ack, and the enrollment would be lost forever.
 *
 * The controller must therefore route through MvpEnrollmentService (the same singleton payment
 * fulfillment uses), which hydrates tenant state from the persisted snapshot and saves the
 * mutation under the per-tenant serial lock. We seed a snapshot with one group + one learner,
 * invoke the controller handler, and assert (a) the enrollment was created and (b) it was
 * persisted so a later request would see it.
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
  void backend.saveFromState(TENANT, seed);
  return backend;
}

function makeController(backend: MemoryMvpPersistenceBackend): MvpInternalWorkerController {
  const runner = new MvpTenantRunner(backend, new TenantSerialGateway());
  const enrollment = new MvpEnrollmentService(
    runner,
    new TenantScopedRepository(),
    new AuditService(),
    new EventEmitter2()
  );
  return new MvpInternalWorkerController(enrollment);
}

describe('MvpInternalWorkerController bulk callback (hydrates + persists outside a request)', () => {
  it('creates and persists the enrollment from a worker callback', async () => {
    const backend = seedBackend();
    const controller = makeController(backend);

    const outcome = await controller.processBulkEnrollment({
      tenantId: TENANT,
      requestId: 'req1',
      correlationId: 'corr1',
      payload: {
        actorId: 'system',
        idempotencyKey: 'queued:o1:g1',
        groupId: 'g1',
        learnerIds: ['l1']
      }
    });

    // (a) the enrollment was actually created (NOT an all-errors not_found outcome)
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

  it('is idempotent across worker retries (at-least-once delivery)', async () => {
    const backend = seedBackend();
    const controller = makeController(backend);
    const body = {
      tenantId: TENANT,
      payload: {
        actorId: 'system',
        idempotencyKey: 'queued:o1:g1',
        groupId: 'g1',
        learnerIds: ['l1']
      }
    };

    const first = await controller.processBulkEnrollment(body);
    const second = await controller.processBulkEnrollment(body);

    expect(second.created[0]!.id).toBe(first.created[0]!.id);
    const reloaded = new InMemoryMvpState();
    await backend.loadIntoState(TENANT, reloaded);
    expect(reloaded.enrollments).toHaveLength(1);
  });
});
