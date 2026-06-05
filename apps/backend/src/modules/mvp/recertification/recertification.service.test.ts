import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';
import { RecertificationService, scanForRecertification } from './recertification.service.js';

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

describe('scanForRecertification (pure)', () => {
  it('selects documents whose validUntil is within the horizon', () => {
    expect(scanForRecertification(ASOF, [doc()] as never, 90).map((c) => c.documentId)).toEqual([
      'gdoc1'
    ]);
  });
  it('selects already-expired documents', () => {
    expect(
      scanForRecertification(ASOF, [doc({ validUntil: '2026-01-01' })] as never, 90)
    ).toHaveLength(1);
  });
  it('ignores beyond-horizon, no-validUntil, and revoked documents', () => {
    const docs = [
      doc({ id: 'far', validUntil: '2027-01-01' }),
      doc({ id: 'none', validUntil: undefined }),
      doc({ id: 'rev', status: 'revoked', revokedAt: '2026-05-01' })
    ];
    expect(scanForRecertification(ASOF, docs as never, 90)).toHaveLength(0);
  });
});

function make(
  overrides: {
    dispatch?: ReturnType<typeof vi.fn>;
    createBulkEnrollments?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const drafts = new InMemoryRecertificationDraftsState();
  const dispatch = overrides.dispatch ?? vi.fn().mockResolvedValue(undefined);
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
  const service = new RecertificationService(
    drafts,
    { dispatch } as never,
    state as never,
    mvp as never,
    documents as never
  );
  return { service, drafts, dispatch, mvp };
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

  it('is idempotent — second scan creates no new draft and sends no new email', async () => {
    const { service, drafts, dispatch } = make();
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const summary = await service.runScan('t1', ASOF, {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
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
