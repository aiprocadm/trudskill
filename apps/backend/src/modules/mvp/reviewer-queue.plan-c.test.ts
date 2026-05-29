import { describe, expect, it } from 'vitest';

import { aggregateReviewerQueue } from './reviewer-queue.service.js';

import type { AttemptAnswer, Question, TestAttempt } from './mvp.types.js';

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
function answer(
  attemptId: string,
  autoGraded: boolean,
  overrides?: Partial<AttemptAnswer>
): AttemptAnswer {
  return {
    id: `a_${attemptId}`,
    tenantId: 't',
    attemptId,
    questionId: 'q1',
    autoGraded,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides
  };
}
function question(id: string, title: string): Question {
  return {
    id,
    tenantId: 't',
    questionBankId: 'bank1',
    type: 'essay',
    title,
    score: 5,
    isArchived: false,
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
        assignmentSubmissions: [],
        questions: []
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
        assignmentSubmissions: [],
        questions: []
      },
      { tenantId: 't' }
    );
    expect(out.pendingAttempts).toHaveLength(0);
  });

  it('populates essayAnswers on attempt items with manual answers', () => {
    const q = question('q1', 'Опишите процедуру');
    const a = answer('manual', false, { questionId: 'q1', textAnswer: 'Мой ответ на эссе' });
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('manual', 'submitted')],
        attemptAnswers: [a],
        assignmentSubmissions: [],
        questions: [q]
      },
      { tenantId: 't' }
    );
    const item = out.pendingAttempts[0]!;
    expect(item.essayAnswers).toHaveLength(1);
    expect(item.essayAnswers![0]!.questionId).toBe('q1');
    expect(item.essayAnswers![0]!.questionTitle).toBe('Опишите процедуру');
    expect(item.essayAnswers![0]!.answerText).toBe('Мой ответ на эссе');
  });

  it('leaves essayAnswers absent when all answers are auto-graded', () => {
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('auto', 'submitted')],
        attemptAnswers: [answer('auto', false, { autoGraded: true })],
        assignmentSubmissions: [],
        questions: []
      },
      { tenantId: 't' }
    );
    // auto-only attempt won't appear (needsManualGrading = false)
    expect(out.pendingAttempts).toHaveLength(0);
  });

  it('uses empty string for questionTitle when question is not found', () => {
    const a = answer('manual', false, { questionId: 'unknown_q', textAnswer: 'some text' });
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('manual', 'submitted')],
        attemptAnswers: [a],
        assignmentSubmissions: [],
        questions: []
      },
      { tenantId: 't' }
    );
    const item = out.pendingAttempts[0]!;
    expect(item.essayAnswers![0]!.questionTitle).toBe('');
    expect(item.essayAnswers![0]!.answerText).toBe('some text');
  });
});
