import { describe, expect, it } from 'vitest';

import { aggregateReviewerQueue } from './reviewer-queue.service.js';

import type {
  AssignmentSubmission,
  AssignmentSubmissionStatus,
  AttemptAnswer,
  AttemptStatus,
  TestAttempt
} from './mvp.types.js';

function makeAttempt(overrides: Partial<TestAttempt> & Pick<TestAttempt, 'id' | 'tenantId'>) {
  const base: TestAttempt = {
    id: overrides.id,
    tenantId: overrides.tenantId,
    testId: 'test_x',
    enrollmentId: 'enr_x',
    learnerId: 'learner_x',
    attemptNo: 1,
    status: 'submitted' as AttemptStatus,
    startedAt: '2026-05-30T12:00:00Z',
    submittedAt: '2026-05-30T12:15:00Z',
    maxScore: 10,
    questionOrder: ['q1'],
    status_at: undefined as never,
    createdAt: '2026-05-30T12:00:00Z',
    updatedAt: '2026-05-30T12:15:00Z'
  } as TestAttempt;
  return { ...base, ...overrides };
}

function makeSubmission(
  overrides: Partial<AssignmentSubmission> & Pick<AssignmentSubmission, 'id' | 'tenantId'>
) {
  const base: AssignmentSubmission = {
    id: overrides.id,
    tenantId: overrides.tenantId,
    assignmentId: 'asn_x',
    enrollmentId: 'enr_x',
    learnerId: 'learner_x',
    status: 'submitted' as AssignmentSubmissionStatus,
    submittedAt: '2026-05-30T13:00:00Z',
    createdAt: '2026-05-30T12:30:00Z',
    updatedAt: '2026-05-30T13:00:00Z'
  } as AssignmentSubmission;
  return { ...base, ...overrides };
}

/** Creates an AttemptAnswer with autoGraded=false (manual essay) for the given attempt. */
function makeManualAnswer(
  attemptId: string,
  tenantId: string,
  overrides?: Partial<AttemptAnswer>
): AttemptAnswer {
  return {
    id: `ans_${attemptId}`,
    tenantId,
    attemptId,
    questionId: 'q_x',
    autoGraded: false,
    status: 'active',
    createdAt: '2026-05-30T12:00:00Z',
    updatedAt: '2026-05-30T12:15:00Z',
    ...overrides
  } as AttemptAnswer;
}

describe('aggregateReviewerQueue (Phase 3 Plan A pure-function)', () => {
  it('returns empty snapshot when both collections are empty', () => {
    const result = aggregateReviewerQueue(
      { testAttempts: [], attemptAnswers: [], assignmentSubmissions: [], questions: [] },
      { tenantId: 't1' }
    );
    expect(result).toEqual({ pendingAttempts: [], pendingSubmissions: [] });
  });

  it('returns pending attempts in `submitted` status for the matching tenant', () => {
    const attempts = [
      makeAttempt({ id: 'a1', tenantId: 't1', status: 'submitted' }),
      makeAttempt({ id: 'a2', tenantId: 't1', status: 'in_progress' }),
      makeAttempt({ id: 'a3', tenantId: 't1', status: 'finished' })
    ];
    const result = aggregateReviewerQueue(
      {
        testAttempts: attempts,
        attemptAnswers: [makeManualAnswer('a1', 't1')],
        assignmentSubmissions: [],
        questions: []
      },
      { tenantId: 't1' }
    );
    expect(result.pendingAttempts).toHaveLength(1);
    expect(result.pendingAttempts[0]!.id).toBe('a1');
    expect(result.pendingAttempts[0]!.kind).toBe('attempt');
  });

  it('returns pending submissions in `submitted` OR `under_review`', () => {
    const submissions = [
      makeSubmission({ id: 's1', tenantId: 't1', status: 'submitted' }),
      makeSubmission({ id: 's2', tenantId: 't1', status: 'under_review' }),
      makeSubmission({ id: 's3', tenantId: 't1', status: 'reviewed' }),
      makeSubmission({ id: 's4', tenantId: 't1', status: 'draft' })
    ];
    const result = aggregateReviewerQueue(
      { testAttempts: [], attemptAnswers: [], assignmentSubmissions: submissions, questions: [] },
      { tenantId: 't1' }
    );
    expect(result.pendingSubmissions.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(result.pendingSubmissions[0]!.kind).toBe('submission');
  });

  it('isolates by tenantId — other-tenant data is invisible', () => {
    const result = aggregateReviewerQueue(
      {
        testAttempts: [
          makeAttempt({ id: 'a_t1', tenantId: 't1', status: 'submitted' }),
          makeAttempt({ id: 'a_t2', tenantId: 't2', status: 'submitted' })
        ],
        attemptAnswers: [makeManualAnswer('a_t1', 't1'), makeManualAnswer('a_t2', 't2')],
        assignmentSubmissions: [
          makeSubmission({ id: 's_t1', tenantId: 't1', status: 'submitted' }),
          makeSubmission({ id: 's_t2', tenantId: 't2', status: 'submitted' })
        ],
        questions: []
      },
      { tenantId: 't1' }
    );
    expect(result.pendingAttempts.map((a) => a.id)).toEqual(['a_t1']);
    expect(result.pendingSubmissions.map((s) => s.id)).toEqual(['s_t1']);
  });

  it('falls back to createdAt when submittedAt is absent on a submitted item', () => {
    const a = makeAttempt({
      id: 'a1',
      tenantId: 't1',
      status: 'submitted'
    });
    delete a.submittedAt;
    const result = aggregateReviewerQueue(
      {
        testAttempts: [a],
        attemptAnswers: [makeManualAnswer('a1', 't1')],
        assignmentSubmissions: [],
        questions: []
      },
      { tenantId: 't1' }
    );
    expect(result.pendingAttempts[0]!.submittedAt).toBe(a.createdAt);
  });

  it('preserves learnerId / testId / assignmentId on shaped output', () => {
    const result = aggregateReviewerQueue(
      {
        testAttempts: [
          makeAttempt({
            id: 'a1',
            tenantId: 't1',
            status: 'submitted',
            testId: 'test_42',
            learnerId: 'learner_42'
          })
        ],
        attemptAnswers: [makeManualAnswer('a1', 't1')],
        assignmentSubmissions: [
          makeSubmission({
            id: 's1',
            tenantId: 't1',
            status: 'submitted',
            assignmentId: 'asn_42',
            learnerId: 'learner_42'
          })
        ],
        questions: []
      },
      { tenantId: 't1' }
    );
    expect(result.pendingAttempts[0]!.testId).toBe('test_42');
    expect(result.pendingAttempts[0]!.learnerId).toBe('learner_42');
    expect(result.pendingSubmissions[0]!.assignmentId).toBe('asn_42');
    expect(result.pendingSubmissions[0]!.learnerId).toBe('learner_42');
  });

  it('is pure (no side effects on input arrays)', () => {
    const attempts = [makeAttempt({ id: 'a1', tenantId: 't1', status: 'submitted' })];
    const submissions = [makeSubmission({ id: 's1', tenantId: 't1', status: 'submitted' })];
    const attemptsSnapshot = JSON.stringify(attempts);
    const submissionsSnapshot = JSON.stringify(submissions);
    aggregateReviewerQueue(
      {
        testAttempts: attempts,
        attemptAnswers: [],
        assignmentSubmissions: submissions,
        questions: []
      },
      { tenantId: 't1' }
    );
    expect(JSON.stringify(attempts)).toBe(attemptsSnapshot);
    expect(JSON.stringify(submissions)).toBe(submissionsSnapshot);
  });
});
