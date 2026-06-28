import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';
import {
  RecertificationScanner,
  scanForRecertification
} from './recertification-scanner.service.js';

const ASOF = '2026-06-05';

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'gdoc1',
    tenantId: 't1',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr1',
    status: 'generated',
    validUntil: '2026-08-01', // 57 days out → 90-day milestone
    ...over
  };
}

function state() {
  return {
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
}

function make(over: { dispatch?: ReturnType<typeof vi.fn>; docs?: unknown[] } = {}) {
  const drafts = new InMemoryRecertificationDraftsState();
  const dispatch =
    over.dispatch ??
    vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
      );
  const documentsRunner = {
    runWithTenantDocuments: async (
      _tenantId: string,
      fn: (d: { listDocuments: () => { items: unknown[]; total: number } }) => unknown
    ) => fn({ listDocuments: () => ({ items: over.docs ?? [doc()], total: 1 }) })
  };
  const scanner = new RecertificationScanner(
    drafts,
    { dispatch } as never,
    documentsRunner as never
  );
  return { scanner, drafts, dispatch };
}

describe('scanForRecertification (pure)', () => {
  it('selects documents within the horizon (including expired), ignores far/none/revoked', () => {
    expect(scanForRecertification(ASOF, [doc()] as never, 90).map((c) => c.documentId)).toEqual([
      'gdoc1'
    ]);
    expect(
      scanForRecertification(ASOF, [doc({ validUntil: '2026-01-01' })] as never, 90)
    ).toHaveLength(1);
    const skip = [
      doc({ id: 'far', validUntil: '2027-01-01' }),
      doc({ id: 'none', validUntil: undefined }),
      doc({ id: 'rev', status: 'revoked', revokedAt: '2026-05-01' })
    ];
    expect(scanForRecertification(ASOF, skip as never, 90)).toHaveLength(0);
  });
});

describe('RecertificationScanner.scanTenant', () => {
  it('creates a draft and dispatches a recertification_due email with the 90-day dedupKey', async () => {
    const { scanner, drafts, dispatch } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(1);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('recertification_due');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.courseTitle).toBe('Охрана труда');
    expect(arg.dedupKey).toMatch(/^recert:.+:90$/);
  });

  it('re-uses the existing draft on a second scan (no new draft) and still dispatches (dispatcher dedups)', async () => {
    const { scanner, drafts, dispatch } = make();
    await scanner.scanTenant('t1', ASOF, state() as never);
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch.mock.calls.every((c) => /^recert:.+:90$/.test(c[0].dedupKey))).toBe(true);
  });

  it('uses the 7-day dedupKey for an already-expired document', async () => {
    const { scanner, dispatch } = make({ docs: [doc({ validUntil: '2026-01-01' })] });
    await scanner.scanTenant('t1', ASOF, state() as never);
    expect(dispatch.mock.calls[0]![0].dedupKey).toMatch(/^recert:.+:7$/);
  });

  it('tolerates a dispatch failure — draft still created, scan does not throw', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner, drafts } = make({ dispatch });
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(1);
    expect(summary.emailsDispatched).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    errorSpy.mockRestore();
  });

  it('includes configured staff recipients (admin-kind) alongside the learner', async () => {
    const { scanner, dispatch } = make();
    const withStaff = {
      ...state(),
      notificationStaffRecipients: [{ tenantId: 't1', email: 'admin@uc.ru' }]
    };
    const summary = await scanner.scanTenant('t1', ASOF, withStaff as never);
    const arg = dispatch.mock.calls[0]![0];
    const emails = arg.recipients.map((r: { email: string }) => r.email);
    expect(emails).toContain('ivan@example.com');
    expect(emails).toContain('admin@uc.ru');
    expect(arg.recipients.find((r: { email: string }) => r.email === 'admin@uc.ru').kind).toBe(
      'admin'
    );
    expect(summary.emailsDispatched).toBe(2);
  });

  it('progresses through the 90 → 30 → 7 dedupKeys as the deadline approaches', async () => {
    const { scanner, dispatch } = make(); // default doc validUntil = '2026-08-01'
    await scanner.scanTenant('t1', '2026-06-05', state() as never); // 57 days out → 90
    await scanner.scanTenant('t1', '2026-07-10', state() as never); // 22 days out → 30
    await scanner.scanTenant('t1', '2026-07-28', state() as never); // 4 days out  → 7
    const milestones = dispatch.mock.calls.map((c) => String(c[0].dedupKey).split(':').pop());
    expect(milestones).toEqual(['90', '30', '7']);
  });
});
