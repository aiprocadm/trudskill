import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';
import { RecertificationScanner } from './recertification-scanner.service.js';
import { RecertificationService } from './recertification.service.js';

const ASOF = '2026-06-05';

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'gdoc1',
    tenantId: 't1',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr1',
    status: 'generated',
    validUntil: '2026-08-01', // within 90 days of ASOF
    ...over
  };
}

function make(
  overrides: {
    dispatch?: ReturnType<typeof vi.fn>;
    createBulkEnrollments?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const drafts = new InMemoryRecertificationDraftsState();
  const dispatch =
    overrides.dispatch ??
    vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
      );
  const state = {
    enrollments: [
      { id: 'enr1', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'completed' }
    ],
    learners: [
      { id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@example.com' }
    ],
    groupCourses: [
      { id: 'gc1', tenantId: 't1', groupId: 'g1', courseId: 'c1', courseVersionId: 'cv1' }
    ],
    groups: [{ id: 'g1', tenantId: 't1', name: 'Группа 1' }],
    counterparties: [],
    courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
    courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }]
  };
  const documents = {
    runWithTenantDocuments: async (
      _tenantId: string,
      fn: (d: { listDocuments: () => { items: unknown[]; total: number } }) => unknown
    ) => fn({ listDocuments: () => ({ items: [doc()], total: 1 }) })
  };
  const mvp = {
    createBulkEnrollments:
      overrides.createBulkEnrollments ??
      vi.fn().mockReturnValue({ created: [{ id: 'enr_new' }], skippedExisting: [], errors: [] })
  };
  const scanner = new RecertificationScanner(drafts, { dispatch } as never, documents as never);
  /* Журнал действий: заглушка копит записи, чтобы проверить сам факт следа (ФТ-G1). */
  const auditRecords: { action: string; entityId?: string; newValues?: unknown }[] = [];
  const audit = {
    write: (record: { action: string; entityId?: string; newValues?: unknown }) => {
      auditRecords.push(record);
      return record;
    }
  };
  const service = new RecertificationService(
    drafts,
    state as never,
    mvp as never,
    scanner,
    undefined as never,
    audit as never
  );
  return { service, drafts, dispatch, mvp, auditRecords };
}

describe('RecertificationService.runScan', () => {
  it('creates a draft and dispatches one recertification_due email to the learner', async () => {
    const { service, drafts, dispatch } = make();
    const summary = await service.runScan('t1', ASOF, {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(summary.draftsCreated).toBe(1);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].templateKey).toBe('recertification_due');
    expect(dispatch.mock.calls[0]![0].recipients[0].email).toBe('ivan@example.com');
    expect(dispatch.mock.calls[0]![0].variables.courseTitle).toBe('Охрана труда');
  });

  it('is idempotent on drafts — a second scan creates no new draft', async () => {
    const { service, drafts } = make();
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const summary = await service.runScan('t1', ASOF, {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
  });

  it('tolerates a dispatch failure — draft is still created, no email counted, scan does not throw', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, drafts } = make({ dispatch });
    const summary = await service.runScan('t1', ASOF, {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(summary.draftsCreated).toBe(1);
    expect(summary.emailsDispatched).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('RecertificationService.approveDraft / rejectDraft', () => {
  it('approveDraft creates an enrollment via bulk-enroll and marks the draft approved', async () => {
    const { service, drafts, mvp } = make();
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const [d] = await drafts.list('t1', {});
    const updated = await service.approveDraft('t1', d!.id, 'g_target', {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(mvp.createBulkEnrollments).toHaveBeenCalledTimes(1);
    expect(updated?.status).toBe('approved');
    expect(updated?.resultingEnrollmentId).toBe('enr_new');
    // approve uses a group-scoped idempotency key so a corrected-group retry is fresh.
    const reqArg = mvp.createBulkEnrollments.mock.calls[0]![2];
    expect(reqArg.idempotencyKey).toContain('::approve::g_target');
  });

  it('approveDraft surfaces the bulk error reason and throws when no enrollment results', async () => {
    const createBulkEnrollments = vi.fn().mockReturnValue({
      created: [],
      skippedExisting: [],
      errors: [{ learnerId: 'l1', code: 'not_found', message: 'Группа не найдена' }]
    });
    const { service, drafts } = make({ createBulkEnrollments });
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const [d] = await drafts.list('t1', {});
    await expect(
      service.approveDraft('t1', d!.id, 'bad_group', {
        tenantId: 't1',
        userId: 'admin1'
      } as never)
    ).rejects.toThrow('Группа не найдена');
  });

  it('rejectDraft marks the draft rejected with a reason', async () => {
    const { service, drafts } = make();
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const [d] = await drafts.list('t1', {});
    const updated = await service.rejectDraft('t1', d!.id, 'не требуется', {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(updated?.status).toBe('rejected');
    expect(updated?.reason).toBe('не требуется');
  });
});

describe('RecertificationService.listDrafts (enrichment)', () => {
  it('enriches each draft with learnerName + courseTitle resolved from state', async () => {
    const { service, drafts } = make();
    await drafts.create({
      tenantId: 't1',
      learnerId: 'l1',
      sourceDocumentId: 'gdoc1',
      courseVersionId: 'cv1',
      validUntil: '2026-08-01'
    });

    const views = await service.listDrafts('t1', {});

    expect(views).toHaveLength(1);
    expect(views[0]!.learnerName).toBe('Иванов Иван');
    expect(views[0]!.courseTitle).toBe('Охрана труда');
    // raw row fields are preserved
    expect(views[0]!.validUntil).toBe('2026-08-01');
    expect(views[0]!.status).toBe('pending');
  });

  it('degrades to empty strings when learner/course cannot be resolved', async () => {
    const { service, drafts } = make();
    await drafts.create({
      tenantId: 't1',
      learnerId: 'ghost',
      sourceDocumentId: 'gdoc9',
      courseVersionId: 'ghost',
      validUntil: '2026-08-01'
    });

    const views = await service.listDrafts('t1', {});

    expect(views[0]!.learnerName).toBe('');
    expect(views[0]!.courseTitle).toBe('');
    expect(views[0]!.learnerSnils).toBeUndefined();
  });
});

describe('решение по переаттестации попадает в журнал действий (ревизия 2026-08-26)', () => {
  /*
   * Одобрение создаёт зачисление, и зачисление в журнале видно. А само решение — нет:
   * отклонение вообще не оставляло следа. Для обязательного обучения вопрос «кто решил, что
   * этот человек на переаттестацию не идёт» задают позже и всерьёз.
   */
  const ctx = { tenantId: 't1', userId: 'admin1' } as never;

  it('одобрение записывает, кого и куда зачислили', async () => {
    const { service, drafts, auditRecords } = make();
    await service.runScan('t1', ASOF, ctx);
    const [draft] = await drafts.list('t1', {});
    await service.approveDraft('t1', draft!.id, 'g_target', ctx);

    const record = auditRecords.find((r) => r.action === 'learning.recertification_approved');
    expect(record?.entityId).toBe(draft!.id);
    expect(record?.newValues).toMatchObject({ targetGroupId: 'g_target', enrollmentId: 'enr_new' });
  });

  it('отклонение записывает причину', async () => {
    const { service, drafts, auditRecords } = make();
    await service.runScan('t1', ASOF, ctx);
    const [draft] = await drafts.list('t1', {});
    await service.rejectDraft('t1', draft!.id, 'слушатель уволился', ctx);

    const record = auditRecords.find((r) => r.action === 'learning.recertification_rejected');
    expect(record?.entityId).toBe(draft!.id);
    expect(record?.newValues).toMatchObject({ reason: 'слушатель уволился' });
  });
});
