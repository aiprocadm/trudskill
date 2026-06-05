import { describe, expect, it } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';

function makeSeed(over: Partial<Parameters<InMemoryRecertificationDraftsState['create']>[0]> = {}) {
  return {
    tenantId: 't1',
    learnerId: 'l1',
    sourceDocumentId: 'gdoc1',
    courseVersionId: 'cv1',
    validUntil: '2026-09-01',
    ...over
  };
}

describe('InMemoryRecertificationDraftsState', () => {
  it('creates a pending draft and lists it back, scoped by tenant', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row, created } = await repo.create(makeSeed());
    expect(created).toBe(true);
    expect(row.status).toBe('pending');
    expect((await repo.list('t1', {})).length).toBe(1);
    expect((await repo.list('t2', {})).length).toBe(0);
  });

  it('is idempotent on (tenant, learner, sourceDocument)', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const first = await repo.create(makeSeed());
    const second = await repo.create(makeSeed());
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect((await repo.list('t1', {})).length).toBe(1);
  });

  it('filters list by status', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    await repo.create(makeSeed({ learnerId: 'l1', sourceDocumentId: 'd1' }));
    await repo.create(makeSeed({ learnerId: 'l2', sourceDocumentId: 'd2' }));
    expect((await repo.list('t1', { status: 'pending' })).length).toBe(2);
    expect((await repo.list('t1', { status: 'approved' })).length).toBe(0);
  });

  it('markApproved sets status + resultingEnrollmentId + decidedBy', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row } = await repo.create(makeSeed());
    const updated = await repo.markApproved('t1', row.id, 'enr_new', 'admin1');
    expect(updated?.status).toBe('approved');
    expect(updated?.resultingEnrollmentId).toBe('enr_new');
    expect(updated?.decidedBy).toBe('admin1');
  });

  it('markRejected sets status + reason', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row } = await repo.create(makeSeed());
    const updated = await repo.markRejected('t1', row.id, 'не актуально', 'admin1');
    expect(updated?.status).toBe('rejected');
    expect(updated?.reason).toBe('не актуально');
  });
});
