import { describe, expect, it, vi } from 'vitest';

import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { DocumentsTenantRunner } from '../../documents/documents-tenant-runner.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import { InMemoryRecertificationDraftsState } from '../recertification/in-memory-recertification-drafts.state.js';
import { RecertificationScanner } from '../recertification/recertification-scanner.service.js';

import type { DocumentsPersistenceBackend } from '../../documents/infrastructure/documents-persistence.backend.js';
import type { MvpPersistenceBackend } from '../infrastructure/mvp-persistence.backend.js';

/**
 * Regression for the nested-runner DEADLOCK fixed by making TenantSerialGateway reentrant.
 *
 * Approach: full REAL runners. One shared TenantSerialGateway drives a REAL MvpTenantRunner and a
 * REAL DocumentsTenantRunner, with the REAL RecertificationScanner between them. This reproduces the
 * exact production nesting from RemindersSchedulerService.runScanAllTenants:
 *
 *   mvpRunner.runWithTenantState(t)            → gateway.runExclusive(t)   [outer]
 *     → recertScanner.scanTenant(t, ..., state)
 *       → documentsRunner.runWithTenantDocuments(t) → gateway.runExclusive(t)  [inner, SAME tenant]
 *
 * On the old non-reentrant gateway the inner runExclusive(t) awaited the still-pending outer
 * promise it was part of — a circular wait — and this test would hang until the 5s timeout.
 *
 * Persistence is faked: loadIntoState seeds the in-memory states (no DB). saveFromState is a no-op.
 * DocumentsService.listDocuments only READS state.generatedDocuments, so audit/realtime are never
 * touched on this path and can be no-op stubs.
 */
describe('reminders nightly scan (nested MvpTenantRunner → DocumentsTenantRunner over real gateway)', () => {
  function seedMvpState(state: InMemoryMvpState): void {
    state.enrollments.push({
      id: 'enr1',
      tenantId: 't1',
      learnerId: 'l1',
      groupId: 'g1',
      status: 'completed',
      enrolledAt: '2026-01-01T00:00:00.000Z'
    } as never);
    state.learners.push({
      id: 'l1',
      tenantId: 't1',
      firstName: 'Иван',
      lastName: 'Иванов',
      email: 'ivan@example.com'
    } as never);
    state.groupCourses.push({
      id: 'gc1',
      tenantId: 't1',
      groupId: 'g1',
      courseId: 'c1',
      courseVersionId: 'cv1',
      sortOrder: 0
    } as never);
    state.groups.push({
      id: 'g1',
      tenantId: 't1',
      code: 'g1',
      name: 'Группа'
    } as never);
    state.courseVersions.push({
      id: 'cv1',
      tenantId: 't1',
      courseId: 'c1',
      versionNo: 1
    } as never);
    state.courses.push({
      id: 'c1',
      tenantId: 't1',
      code: 'c1',
      title: 'Охрана труда',
      isArchived: false
    } as never);
  }

  function seedDocsState(state: InMemoryDocumentsState): void {
    state.generatedDocuments.push({
      id: 'gdoc1',
      tenantId: 't1',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr1',
      status: 'generated',
      validUntil: '2026-08-01'
    } as never);
  }

  it(
    'completes a nested scan and creates a draft (would deadlock on the non-reentrant gateway)',
    { timeout: 5000 },
    async () => {
      const gateway = new TenantSerialGateway();

      const fakeMvpPersistence: MvpPersistenceBackend = {
        loadIntoState: vi.fn(async (_tenantId: string, state: InMemoryMvpState) => {
          seedMvpState(state);
        }),
        saveFromState: vi.fn(async () => undefined)
      };
      const mvpRunner = new MvpTenantRunner(fakeMvpPersistence, gateway);

      const fakeDocsPersistence: DocumentsPersistenceBackend = {
        loadIntoState: vi.fn(async (_tenantId: string, state: InMemoryDocumentsState) => {
          seedDocsState(state);
        }),
        saveFromState: vi.fn(async () => undefined)
      };
      const fakeAudit = { write: vi.fn(), writeCritical: vi.fn() };
      const fakeRealtime = { publish: vi.fn() };
      const documentsRunner = new DocumentsTenantRunner(
        fakeDocsPersistence,
        gateway,
        fakeAudit as never,
        fakeRealtime as never
      );

      const drafts = new InMemoryRecertificationDraftsState();
      const fakeDispatch = vi
        .fn()
        .mockImplementation((input) =>
          Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
        );
      const recertScanner = new RecertificationScanner(
        drafts,
        { dispatch: fakeDispatch } as never,
        documentsRunner
      );

      const summary = await mvpRunner.runWithTenantState('t1', async (state) =>
        recertScanner.scanTenant('t1', '2026-06-05', state)
      );

      expect(summary.draftsCreated).toBe(1);
      expect((await drafts.list('t1', {})).length).toBe(1);
      expect(fakeDispatch).toHaveBeenCalledTimes(1);
      // Confirm both persistence backends were actually exercised (real runners ran).
      expect(fakeMvpPersistence.loadIntoState).toHaveBeenCalledWith(
        't1',
        expect.any(InMemoryMvpState)
      );
      expect(fakeDocsPersistence.loadIntoState).toHaveBeenCalledWith(
        't1',
        expect.any(InMemoryDocumentsState)
      );
    }
  );
});
