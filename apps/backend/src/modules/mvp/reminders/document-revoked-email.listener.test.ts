import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DocumentRevokedEmailListener } from './document-revoked-email.listener.js';

function fakeState() {
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

function make(dispatch = vi.fn().mockResolvedValue(undefined)) {
  const mvpRunner = {
    runWithTenantState: async (_t: string, fn: (state: unknown) => Promise<unknown>) =>
      fn(fakeState())
  };
  const listener = new DocumentRevokedEmailListener(mvpRunner as never, { dispatch } as never);
  return { listener, dispatch };
}

const payload = {
  tenantId: 't1',
  documentId: 'gdoc1',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'enr1',
  reason: 'Ошибка в данных'
};

describe('DocumentRevokedEmailListener', () => {
  it('dispatches a document_revoked email to the learner with the revoked dedupKey', async () => {
    const { listener, dispatch } = make();
    await listener.handle(payload as never);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('document_revoked');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.reason).toBe('Ошибка в данных');
    expect(arg.variables.courseTitle).toBe('Охрана труда');
    expect(arg.dedupKey).toBe('revoked:gdoc1');
  });

  it('does nothing when the payload has no sourceEntityId', async () => {
    const { listener, dispatch } = make();
    await listener.handle({ tenantId: 't1', documentId: 'gdoc1', reason: 'x' } as never);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the enrollment cannot be resolved (no recipients)', async () => {
    const { listener, dispatch } = make();
    await listener.handle({ ...payload, sourceEntityId: 'missing' } as never);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { listener } = make(dispatch);
    await expect(listener.handle(payload as never)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});
