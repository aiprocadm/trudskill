import { describe, expect, it } from 'vitest';

import {
  buildStaffRecipients,
  resolveCourseTitleByVersion,
  resolveLearnerDisplay
} from './reminder-recipients.js';

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

const courseState = {
  courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
  courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }]
} as unknown as InMemoryMvpState;

describe('resolveCourseTitleByVersion', () => {
  it('resolves course title through version → course', () => {
    expect(resolveCourseTitleByVersion(courseState, 't1', 'cv1')).toBe('Охрана труда');
  });
  it('returns undefined when the course version is missing', () => {
    expect(resolveCourseTitleByVersion(courseState, 't1', 'ghost')).toBeUndefined();
  });
  it('returns undefined when the version exists but the course is missing', () => {
    const orphan = {
      courseVersions: [{ id: 'cv2', tenantId: 't1', courseId: 'absent' }],
      courses: []
    } as unknown as InMemoryMvpState;
    expect(resolveCourseTitleByVersion(orphan, 't1', 'cv2')).toBeUndefined();
  });
  it('does not resolve a version from another tenant', () => {
    expect(resolveCourseTitleByVersion(courseState, 'other', 'cv1')).toBeUndefined();
  });
});

const staffState = {
  notificationStaffRecipients: [
    { tenantId: 't1', email: 'admin@uc.ru' },
    { tenantId: 't1', email: 'curator@uc.ru' },
    { tenantId: 'other', email: 'foreign@uc.ru' }
  ]
} as unknown as InMemoryMvpState;

describe('buildStaffRecipients', () => {
  it('maps configured tenant staff emails to admin-kind recipients', () => {
    expect(buildStaffRecipients(staffState, 't1')).toEqual([
      { email: 'admin@uc.ru', kind: 'admin' },
      { email: 'curator@uc.ru', kind: 'admin' }
    ]);
  });

  it('does not leak staff recipients across tenants', () => {
    expect(buildStaffRecipients(staffState, 'other')).toEqual([
      { email: 'foreign@uc.ru', kind: 'admin' }
    ]);
  });

  it('returns empty list when none configured for the tenant', () => {
    expect(buildStaffRecipients(staffState, 'ghost')).toEqual([]);
  });

  it('is graceful when the collection is absent (undefined)', () => {
    expect(buildStaffRecipients({} as unknown as InMemoryMvpState, 't1')).toEqual([]);
  });
});
