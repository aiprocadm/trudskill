import { describe, expect, it } from 'vitest';

import { resolveLearnerDisplay } from './reminder-recipients.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const state = {
  learners: [
    {
      id: 'l1',
      tenantId: 't1',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Петрович',
      snils: '123-456-789 01'
    },
    { id: 'l2', tenantId: 't1', firstName: 'Анна', lastName: 'Сидорова' }
  ]
} as unknown as InMemoryMvpState;

describe('resolveLearnerDisplay', () => {
  it('builds ФИО as lastName firstName middleName and includes snils', () => {
    expect(resolveLearnerDisplay(state, 't1', 'l1')).toEqual({
      name: 'Иванов Иван Петрович',
      snils: '123-456-789 01'
    });
  });

  it('omits snils when absent and skips missing middleName', () => {
    expect(resolveLearnerDisplay(state, 't1', 'l2')).toEqual({ name: 'Сидорова Анна' });
  });

  it('returns empty name when learner is not found (graceful)', () => {
    expect(resolveLearnerDisplay(state, 't1', 'ghost')).toEqual({ name: '' });
  });

  it('does not leak learners across tenants', () => {
    expect(resolveLearnerDisplay(state, 'other', 'l1')).toEqual({ name: '' });
  });
});
