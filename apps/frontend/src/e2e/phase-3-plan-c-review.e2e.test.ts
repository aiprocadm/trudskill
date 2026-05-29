import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';
import {
  formatSubmissionStatus,
  isSubmissionEditable
} from '../features/practical-submissions/format';

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
    'assessment.assignments.read',
    'assessment.submissions.submit',
    'assessment.results.read'
  ]
};

const noAssignments: UserSession = { ...learner, permissions: ['enrollments.read'] };

const reviewer: UserSession = {
  user: {
    id: 'u_reviewer',
    tenantId: 'tenant_demo',
    login: 'reviewer',
    email: null,
    status: 'active',
    displayName: 'Reviewer'
  },
  tokens: { accessToken: 'b', sessionId: 's2', expiresIn: 1000 },
  roles: ['teacher'],
  permissions: ['assessment.reviews.review', 'assessment.assignments.read']
};

describe('Plan C — learner assignment routing', () => {
  it('grants /learner/assignments with assessment.assignments.read', () => {
    expect(evaluateRouteAccess('/learner/assignments', learner)).toEqual({ kind: 'ok' });
  });
  it('grants the submit route pattern with assessment.submissions.submit', () => {
    // The route resolver uses prefix matching; the pattern key /learner/assignments/[id]/submit
    // is checked against the literal pattern string (not a named-param router)
    expect(evaluateRouteAccess('/learner/assignments/[id]/submit', learner)).toEqual({
      kind: 'ok'
    });
  });
  it('denies /learner/assignments without assignments.read', () => {
    expect(evaluateRouteAccess('/learner/assignments', noAssignments)).toEqual({
      kind: 'forbidden'
    });
  });
  it('denies the submit route pattern without submissions.submit', () => {
    const noSubmit: UserSession = {
      ...learner,
      permissions: ['enrollments.read', 'assessment.assignments.read']
    };
    expect(evaluateRouteAccess('/learner/assignments/[id]/submit', noSubmit)).toEqual({
      kind: 'forbidden'
    });
  });
  it('redirects to login with no session', () => {
    expect(evaluateRouteAccess('/learner/assignments', null)).toEqual({
      kind: 'redirect-login'
    });
  });
});

describe('Plan C — learner assignment navigation', () => {
  it('shows «Мои задания» to a learner with assignments.read', () => {
    expect(getVisibleNavigation(learner).map((i) => i.href)).toContain('/learner/assignments');
  });
  it('hides it without the permission', () => {
    expect(getVisibleNavigation(noAssignments).map((i) => i.href)).not.toContain(
      '/learner/assignments'
    );
  });
});

describe('Plan C — reviewer routing', () => {
  it('grants /teacher/review with assessment.reviews.review', () => {
    expect(evaluateRouteAccess('/teacher/review', reviewer)).toEqual({ kind: 'ok' });
  });
  it('denies /teacher/review without reviews.review', () => {
    const noReview: UserSession = { ...reviewer, permissions: ['assessment.assignments.read'] };
    expect(evaluateRouteAccess('/teacher/review', noReview)).toEqual({ kind: 'forbidden' });
  });
  it('redirects to login with no session', () => {
    expect(evaluateRouteAccess('/teacher/review', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('Plan C — format pipeline', () => {
  it('formats submission statuses in Russian', () => {
    expect(formatSubmissionStatus('under_review')).toBe('На проверке');
    expect(formatSubmissionStatus('draft')).toBe('Черновик');
    expect(formatSubmissionStatus('submitted')).toBe('Отправлено');
    expect(formatSubmissionStatus('returned')).toBe('Возвращено на доработку');
  });
  it('isSubmissionEditable: returned and draft are editable; under_review is not', () => {
    expect(isSubmissionEditable('returned')).toBe(true);
    expect(isSubmissionEditable('draft')).toBe(true);
    expect(isSubmissionEditable('under_review')).toBe(false);
    expect(isSubmissionEditable('submitted')).toBe(false);
  });
});

describe('Plan C — module smoke', () => {
  it('loads AssignmentsListScreen', async () => {
    const mod = await import('../features/practical-submissions/assignments-list-screen');
    expect(typeof mod.AssignmentsListScreen).toBe('function');
  });
  it('loads SubmissionScreen', async () => {
    const mod = await import('../features/practical-submissions/submission-screen');
    expect(typeof mod.SubmissionScreen).toBe('function');
  });
  it('loads ReviewerActionsScreen', async () => {
    const mod = await import('../features/reviewer-actions/reviewer-actions-screen');
    expect(typeof mod.ReviewerActionsScreen).toBe('function');
  });
});
