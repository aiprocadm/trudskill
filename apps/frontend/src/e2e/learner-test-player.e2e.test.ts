import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';
import {
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatTimeRemaining
} from '../features/test-player/format';

import type { UserSession } from '../entities/session/model';

const learner: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: null,
    status: 'active',
    displayName: 'Learner'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['learner'],
  permissions: [
    'enrollments.read',
    'assessment.tests.read',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.results.read'
  ]
};
const noAssessment: UserSession = { ...learner, permissions: ['enrollments.read'] };

describe('learner test player — routing', () => {
  it('grants /learner/tests with assessment.tests.read', () => {
    expect(evaluateRouteAccess('/learner/tests', learner)).toEqual({ kind: 'ok' });
  });
  it('grants the attempt player route to a learner (resolved via the /learner/tests prefix)', () => {
    expect(evaluateRouteAccess('/learner/tests/t1/attempt/at1', learner)).toEqual({ kind: 'ok' });
  });
  it('grants the result route to a learner', () => {
    expect(evaluateRouteAccess('/learner/tests/t1/result', learner)).toEqual({ kind: 'ok' });
  });
  it('denies /learner/tests without tests.read', () => {
    expect(evaluateRouteAccess('/learner/tests', noAssessment)).toEqual({ kind: 'forbidden' });
  });
  it('redirects to login with no session', () => {
    expect(evaluateRouteAccess('/learner/tests', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('learner test player — navigation', () => {
  it('shows "Мои тесты" to a learner with tests.read', () => {
    expect(getVisibleNavigation(learner).map((i) => i.href)).toContain('/learner/tests');
  });
  it('hides it without the permission', () => {
    expect(getVisibleNavigation(noAssessment).map((i) => i.href)).not.toContain('/learner/tests');
  });
});

describe('learner test player — format pipeline', () => {
  it('formats status, attempts, timer', () => {
    expect(formatLearnerTestStatus('in_progress')).toBe('В процессе');
    expect(formatAttemptsLeft(0, 2)).toBe('Осталось попыток: 2 из 2');
    expect(formatTimeRemaining(90000)).toBe('01:30');
  });
});

describe('learner test player — module smoke', () => {
  it('loads TestsListScreen', async () => {
    const mod = await import('../features/test-player/tests-list-screen');
    expect(typeof mod.TestsListScreen).toBe('function');
  });
  it('loads TestAttemptScreen', async () => {
    const mod = await import('../features/test-player/test-attempt-screen');
    expect(typeof mod.TestAttemptScreen).toBe('function');
  });
  it('loads TestResultScreen', async () => {
    const mod = await import('../features/test-player/test-result-screen');
    expect(typeof mod.TestResultScreen).toBe('function');
  });
});
