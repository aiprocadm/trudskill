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

  it('includes userId when the learner is linked to an IAM account (Phase 10 Track C)', () => {
    expect(
      learnerRecipient(learner({ email: 'ivan@example.com', linkedIamUserId: 'user-1' }))
    ).toEqual({
      email: 'ivan@example.com',
      name: 'Иванов Иван',
      userId: 'user-1'
    });
  });

  it('omits userId when the learner has no IAM link', () => {
    expect(learnerRecipient(learner({ email: 'ivan@example.com' }))).not.toHaveProperty('userId');
  });

  it('прокидывает телефон для второго канала доставки (ФТ-C1.3, Фаза 3 Task 5)', () => {
    expect(
      learnerRecipient(learner({ email: 'ivan@example.com', phone: '8 999 123-45-67' }))
    ).toEqual({
      email: 'ivan@example.com',
      name: 'Иванов Иван',
      // Как ввели: к E.164 приводит сам канал перед отправкой.
      phone: '8 999 123-45-67'
    });
  });

  it('без телефона поля phone нет вовсе (exactOptionalPropertyTypes)', () => {
    expect(learnerRecipient(learner({ email: 'ivan@example.com' }))).not.toHaveProperty('phone');
  });

  it('телефон без email не создаёт получателя — контакт разрешается через почту', () => {
    // Осознанное ограничение ветки A: слушатель без email не получает НИ письма, ни СМС.
    // Так было и до второго канала; менять контракт получателя — отдельная задача.
    expect(learnerRecipient(learner({ email: undefined, phone: '+79991234567' }))).toBeUndefined();
  });
});
