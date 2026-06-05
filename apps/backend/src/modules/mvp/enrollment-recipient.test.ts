import { describe, expect, it } from 'vitest';

import { learnerRecipient } from './enrollment-recipient.js';

import type { Learner } from './mvp.types.js';

function learner(partial: Partial<Learner>): Learner {
  return {
    id: 'l1',
    tenantId: 't1',
    firstName: 'Иван',
    lastName: 'Иванов',
    status: 'active',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...partial
  } as Learner;
}

describe('learnerRecipient', () => {
  it('builds "Фамилия Имя" + email when an e-mail is present', () => {
    expect(learnerRecipient(learner({ email: 'ivan@example.com' }))).toEqual({
      email: 'ivan@example.com',
      name: 'Иванов Иван'
    });
  });

  it('includes middleName (patronymic) when present', () => {
    expect(
      learnerRecipient(learner({ email: 'ivan@example.com', middleName: 'Иванович' }))
    ).toEqual({
      email: 'ivan@example.com',
      name: 'Иванов Иван Иванович'
    });
  });

  it('returns undefined when the learner has no e-mail', () => {
    expect(learnerRecipient(learner({ email: undefined }))).toBeUndefined();
  });

  it('returns undefined when the learner is undefined', () => {
    expect(learnerRecipient(undefined)).toBeUndefined();
  });
});
