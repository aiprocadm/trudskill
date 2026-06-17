import { describe, expect, it } from 'vitest';

import { makeMvpService } from './test-support/make-mvp-service.js';

describe('ЕСИА identity helpers', () => {
  it('normalises СНИЛС and matches a learner regardless of formatting', () => {
    const { service, state, tenantId } = makeMvpService();
    state.learners.push({
      id: 'lrn_1',
      tenantId,
      firstName: 'Иван',
      lastName: 'Иванов',
      snils: '112-233-445 95',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    const found = service.findLearnersBySnils(tenantId, '11223344595');
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('lrn_1');
  });

  it('auto-approves identity for a learner and is idempotent', () => {
    const { service, state, tenantId, ctx } = makeMvpService();
    state.learners.push({
      id: 'lrn_1',
      tenantId,
      firstName: 'Иван',
      lastName: 'Иванов',
      snils: '11223344595',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    const first = service.approveIdentityViaEsia(tenantId, 'lrn_1', ctx);
    const second = service.approveIdentityViaEsia(tenantId, 'lrn_1', ctx);
    expect(first.verificationStatus).toBe('approved');
    expect(first.method).toBe('esia');
    expect(second.id).toBe(first.id); // idempotent — no duplicate record
    expect(state.identityVerifications.filter((v) => v.learnerId === 'lrn_1')).toHaveLength(1);
  });

  it('linkLearnerToIamUser: links when empty, no-op when already linked to same id', () => {
    const { service, state, tenantId } = makeMvpService();
    state.learners.push({
      id: 'lrn_2',
      tenantId,
      firstName: 'Пётр',
      lastName: 'Петров',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    // First call: should link
    service.linkLearnerToIamUser(tenantId, 'lrn_2', 'iam_u1');
    expect(state.learners.find((l) => l.id === 'lrn_2')!.linkedIamUserId).toBe('iam_u1');
    // Second call: same iamUserId — no-op (still linked, no overwrite)
    service.linkLearnerToIamUser(tenantId, 'lrn_2', 'iam_u1');
    expect(state.learners.find((l) => l.id === 'lrn_2')!.linkedIamUserId).toBe('iam_u1');
  });

  it('linkLearnerToIamUser: does NOT overwrite an existing different link', () => {
    const { service, state, tenantId } = makeMvpService();
    state.learners.push({
      id: 'lrn_3',
      tenantId,
      firstName: 'Сидор',
      lastName: 'Сидоров',
      linkedIamUserId: 'iam_existing',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    // Attempt to overwrite with different id — must be a no-op
    service.linkLearnerToIamUser(tenantId, 'lrn_3', 'iam_other');
    // Original link must survive
    expect(state.learners.find((l) => l.id === 'lrn_3')!.linkedIamUserId).toBe('iam_existing');
  });

  it('getLinkedLearnerForUser: returns learner when linked', () => {
    const { service, state, tenantId } = makeMvpService();
    state.learners.push({
      id: 'lrn_4',
      tenantId,
      firstName: 'Анна',
      lastName: 'Аннова',
      linkedIamUserId: 'iam_u4',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    const learner = service.getLinkedLearnerForUser(tenantId, 'iam_u4');
    expect(learner.id).toBe('lrn_4');
  });

  it('getLinkedLearnerForUser: throws learner_not_linked when none found', () => {
    const { service, tenantId } = makeMvpService();
    let err: unknown;
    try {
      service.getLinkedLearnerForUser(tenantId, 'iam_nobody');
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const body = (err as { getResponse?: () => unknown }).getResponse?.() as
      | { code?: string }
      | undefined;
    expect(body?.code).toBe('learner_not_linked');
  });
});
