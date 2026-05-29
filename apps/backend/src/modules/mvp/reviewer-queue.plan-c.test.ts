import { describe, expect, it } from 'vitest';

import { aggregateReviewerQueue } from './reviewer-queue.service.js';

import type { AttemptAnswer, TestAttempt } from './mvp.types.js';

function attempt(id: string, status: TestAttempt['status']): TestAttempt {
  return {
    id,
    tenantId: 't',
    testId: 'test1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    attemptNo: 1,
    status,
    startedAt: 'now',
    maxScore: 5,
    questionOrder: ['q1'],
    createdAt: 'now',
    updatedAt: 'now'
  };
}
function answer(attemptId: string, autoGraded: boolean): AttemptAnswer {
  return {
    id: `a_${attemptId}`,
    tenantId: 't',
    attemptId,
    questionId: 'q1',
    autoGraded,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now'
  };
}

describe('aggregateReviewerQueue — Plan C essay-pending filter', () => {
  it('includes a submitted attempt only when it has a non-auto-graded answer', () => {
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('manual', 'submitted'), attempt('auto', 'submitted')],
        attemptAnswers: [answer('manual', false), answer('auto', true)],
        assignmentSubmissions: []
      },
      { tenantId: 't' }
    );
    expect(out.pendingAttempts.map((p) => p.id)).toEqual(['manual']);
  });

  it('excludes non-submitted attempts regardless of answers', () => {
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('finished', 'finished')],
        attemptAnswers: [answer('finished', false)],
        assignmentSubmissions: []
      },
      { tenantId: 't' }
    );
    expect(out.pendingAttempts).toHaveLength(0);
  });
});
