import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService(): MvpService {
  return new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
}

/** Builds course → group → groupCourse → learner → enrollment → bank in fresh state. */
function seedEnrollment(service: MvpService, opts: { linkedIamUserId?: string } = {}) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
  const learner = service.createLearner(
    T,
    ADMIN,
    {
      code: 'L1',
      name: 'Jane Doe',
      ...(opts.linkedIamUserId ? { linkedIamUserId: opts.linkedIamUserId } : {})
    },
    ctx
  );
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);
  return { course, group, learner, enrollment, bank };
}

describe('createQuestion — Plan B grading-field persistence', () => {
  it('persists numericExpected + numericTolerance for number_input', () => {
    const service = makeService();
    const { bank } = seedEnrollment(service);
    const q = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'Pi?',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    const stored = service.getQuestion(T, q.id);
    expect(stored.numericExpected).toBe(3.14);
    expect(stored.numericTolerance).toBe(0.01);
  });

  it('persists expectedAnswer for text and tags for any type', () => {
    const service = makeService();
    const { bank } = seedEnrollment(service);
    const q = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank.id,
        type: 'text',
        title: 'Capital?',
        score: 2,
        expectedAnswer: 'Москва',
        tags: ['geo', 'capitals']
      },
      ctx
    );
    const stored = service.getQuestion(T, q.id);
    expect(stored.expectedAnswer).toBe('Москва');
    expect(stored.tags).toEqual(['geo', 'capitals']);
  });
});

/** Seeds a single-question test and starts an attempt for the (unlinked) learner. */
function startSingleQuestionAttempt(
  service: MvpService,
  question: { questionBankId: string; type: string; score?: number } & Record<string, unknown>,
  enrollment: { id: string; learnerId: string },
  courseId: string,
  bankId: string,
  passingScore: number,
  actor = ADMIN
) {
  const q = service.createQuestion(T, ADMIN, question as never, ctx);
  const test = service.createTest(
    T,
    ADMIN,
    { title: 'Test', courseId, questionBankId: bankId, rules: { attemptLimit: 1, passingScore } },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  const attempt = service.startAttempt(
    T,
    actor,
    { testId: test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
    ctx
  );
  return { q, test, attempt };
}

describe('submitAttempt — Plan B autograding integration', () => {
  it('grades number_input within tolerance and records per-answer score + autoGraded', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '3.15' }, ctx);
    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.score).toBe(2);
    expect(submitted.passed).toBe(true);
    const answer = service['state'].attemptAnswers.find((a) => a.questionId === q.id)!;
    expect(answer.score).toBe(2);
    expect(answer.autoGraded).toBe(true);
  });

  it('REGRESSION: number_input with a wrong answer scores 0 (was full-marks before gradeAnswer)', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '9.99' }, ctx);
    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.score).toBe(0);
    expect(submitted.passed).toBe(false);
  });

  it('grades text by normalized match', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      { questionBankId: bank.id, type: 'text', score: 2, expectedAnswer: 'Москва' },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(
      T,
      ADMIN,
      attempt.id,
      { questionId: q.id, textAnswer: '  москва ' },
      ctx
    );
    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.score).toBe(2);
  });

  it('abstains on essay: per-answer autoGraded:false, contributes 0 to attempt score', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      { questionBankId: bank.id, type: 'essay', score: 5 },
      enrollment,
      course.id,
      bank.id,
      1
    );
    service.saveAttemptAnswer(
      T,
      ADMIN,
      attempt.id,
      { questionId: q.id, textAnswer: 'A long essay answer.' },
      ctx
    );
    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.score).toBe(0);
    const answer = service['state'].attemptAnswers.find((a) => a.questionId === q.id)!;
    expect(answer.autoGraded).toBe(false);
    expect(answer.score).toBe(0);
  });
});

describe('getAttemptResult — a read must NOT flip a passing result (CRITICAL)', () => {
  it('keeps passed=true when reading the result of a submitted (not finished) attempt', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '3.14' }, ctx);
    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    // submitAttempt leaves status 'submitted' (only finishAttempt/review reach 'finished').
    expect(submitted.status).toBe('submitted');
    expect(submitted.passed).toBe(true);

    // getAttemptResult recalculates the persisted ExamResult. It must use the SAME
    // attempt filter as finalizeExamResult (submitted+finished) — otherwise a plain
    // read silently re-grades against finished-only attempts and flips passed → false.
    const result = service.getAttemptResult(T, attempt.id);
    expect(result.passed).toBe(true);
    expect(result.bestScore).toBe(2);

    // And the persisted record must stay passed after the read.
    const persisted = service['state'].examResults.find(
      (r) => r.enrollmentId === enrollment.id && r.testId === result.testId
    );
    expect(persisted?.passed).toBe(true);
  });
});

describe('submitAttempt — time limit enforcement (CRITICAL)', () => {
  it('finalizes an attempt whose time elapsed as expired, not as a passing submission', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    // Learner answers correctly while the attempt is still open.
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '3.14' }, ctx);

    // Time runs out before the learner submits.
    const stored = service['state'].attempts.find((a) => a.id === attempt.id)!;
    stored.expiresAt = new Date(Date.now() - 60_000).toISOString();

    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);

    // The time limit must be enforced: a late submit is finalized as expired,
    // never accepted as a passing submission (mirrors finishAttempt semantics).
    expect(submitted.status).toBe('expired');
    expect(submitted.passed).toBeFalsy();

    // An expired attempt must not produce a passing exam result.
    const passing = service['state'].examResults.find(
      (r) => r.enrollmentId === enrollment.id && r.passed
    );
    expect(passing).toBeUndefined();
  });

  it('finishAttempt on an elapsed attempt preserves expired status (does not resurrect to finished)', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '3.14' }, ctx);

    // Time runs out, then the learner hits "finish" (the /finish endpoint) instead of /submit.
    const stored = service['state'].attempts.find((a) => a.id === attempt.id)!;
    stored.expiresAt = new Date(Date.now() - 60_000).toISOString();

    const finished = service.finishAttempt(T, ADMIN, attempt.id, ctx);

    // finishAttempt must NOT overwrite the terminal 'expired' state with 'finished'.
    expect(finished.status).toBe('expired');
    expect(finished.passed).toBeFalsy();
    const passing = service['state'].examResults.find(
      (r) => r.enrollmentId === enrollment.id && r.passed
    );
    expect(passing).toBeUndefined();
  });
});

describe('exam result — finalScore and bestScore stay consistent across finalizers', () => {
  it('submitAttempt populates BOTH finalScore and bestScore, not just one', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const { q, attempt } = startSingleQuestionAttempt(
      service,
      {
        questionBankId: bank.id,
        type: 'number_input',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      enrollment,
      course.id,
      bank.id,
      2
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '3.14' }, ctx);
    service.submitAttempt(T, ADMIN, attempt.id, ctx);

    // finalizeExamResult (submit path) and recalculateExamResult (read/finish path)
    // historically wrote disjoint score fields (finalScore vs bestScore) to the SAME
    // record, so a consumer reading the "other" field got undefined → NaN downstream.
    const persisted = service['state'].examResults.find((r) => r.enrollmentId === enrollment.id)!;
    expect(persisted.finalScore).toBe(2);
    expect(persisted.bestScore).toBe(2);
    expect(persisted.passingScore).toBe(2);

    // A subsequent read (recalculate) keeps both fields consistent.
    service.getAttemptResult(T, attempt.id);
    const afterRead = service['state'].examResults.find((r) => r.enrollmentId === enrollment.id)!;
    expect(afterRead.finalScore).toBe(2);
    expect(afterRead.bestScore).toBe(2);
  });
});

describe('getAttemptQuestions — answer-safe projection', () => {
  it('omits every answer-key field and sorts options by sortOrder', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const q = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank.id,
        type: 'single_choice',
        title: 'Pick',
        body: 'Choose one',
        score: 2,
        explanation: 'because',
        options: [
          { text: 'wrong', isCorrect: false },
          { text: 'right', isCorrect: true }
        ]
      },
      ctx
    );
    const test = service.createTest(
      T,
      ADMIN,
      {
        title: 'T',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions(T, test.id, [q.id]);
    const attempt = service.startAttempt(
      T,
      ADMIN,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
      ctx
    );

    const views = service.getAttemptQuestions(T, ADMIN, attempt.id, ctx);
    expect(views).toHaveLength(1);
    const view = views[0];
    expect(view.title).toBe('Pick');
    expect(view.body).toBe('Choose one');
    expect(Object.keys(view)).not.toContain('explanation');
    expect(Object.keys(view)).not.toContain('numericExpected');
    expect(Object.keys(view)).not.toContain('expectedAnswer');
    expect(view.options.map((o) => o.sortOrder)).toEqual([0, 1]);
    for (const option of view.options) {
      expect(Object.keys(option)).toEqual(['id', 'text', 'sortOrder']);
      expect(Object.keys(option)).not.toContain('isCorrect');
    }
  });

  it('echoes the learner saved answer so the player can resume', () => {
    const service = makeService();
    const { course, enrollment, bank } = seedEnrollment(service);
    const q = service.createQuestion(
      T,
      ADMIN,
      { questionBankId: bank.id, type: 'text', title: 'Q', score: 2, expectedAnswer: 'x' },
      ctx
    );
    const test = service.createTest(
      T,
      ADMIN,
      {
        title: 'T',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions(T, test.id, [q.id]);
    const attempt = service.startAttempt(
      T,
      ADMIN,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
      ctx
    );
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: 'draft' }, ctx);
    const view = service.getAttemptQuestions(T, ADMIN, attempt.id, ctx)[0];
    expect(view.textAnswer).toBe('draft');
  });
});

describe('listMyTests — learner test dashboard', () => {
  it('returns empty for an actor with no linked learner profile', () => {
    const service = makeService();
    seedEnrollment(service); // learner has no linkedIamUserId
    expect(service.listMyTests(T, 'u_nobody')).toEqual([]);
  });

  it('reports not_started → in_progress → passed across the attempt lifecycle', () => {
    const service = makeService();
    const learnerUser = 'u_learner';
    const { course, enrollment, bank } = seedEnrollment(service, { linkedIamUserId: learnerUser });
    const q = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank.id,
        type: 'single_choice',
        title: 'Q',
        score: 2,
        options: [
          { text: 'right', isCorrect: true },
          { text: 'wrong', isCorrect: false }
        ]
      },
      ctx
    );
    const test = service.createTest(
      T,
      ADMIN,
      {
        title: 'Exam',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 2, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions(T, test.id, [q.id]);

    const beforeStart = service.listMyTests(T, learnerUser);
    expect(beforeStart).toHaveLength(1);
    expect(beforeStart[0]).toMatchObject({
      testId: test.id,
      title: 'Exam',
      courseId: course.id,
      enrollmentId: enrollment.id,
      learnerId: enrollment.learnerId,
      status: 'not_started',
      attemptsUsed: 0,
      attemptLimit: 2,
      maxScore: 2
    });
    expect(beforeStart[0].bestScore).toBeUndefined();
    expect(beforeStart[0].activeAttemptId).toBeUndefined();

    const attempt = service.startAttempt(
      T,
      learnerUser,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
      ctx
    );
    expect(service.listMyTests(T, learnerUser)[0]).toMatchObject({
      status: 'in_progress',
      attemptsUsed: 1,
      activeAttemptId: attempt.id
    });

    const correct = service['state'].answerOptions.find(
      (o) => o.questionId === q.id && o.isCorrect
    )!;
    service.saveAttemptAnswer(
      T,
      learnerUser,
      attempt.id,
      { questionId: q.id, answerOptionIds: [correct.id] },
      ctx
    );
    service.submitAttempt(T, learnerUser, attempt.id, ctx);

    const afterPass = service.listMyTests(T, learnerUser)[0];
    expect(afterPass.status).toBe('passed');
    expect(afterPass.bestScore).toBe(2);
  });

  it('reports failed when attempts are exhausted without a pass', () => {
    const service = makeService();
    const learnerUser = 'u_learner';
    const { course, enrollment, bank } = seedEnrollment(service, { linkedIamUserId: learnerUser });
    const q = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank.id,
        type: 'single_choice',
        title: 'Q',
        score: 2,
        options: [
          { text: 'right', isCorrect: true },
          { text: 'wrong', isCorrect: false }
        ]
      },
      ctx
    );
    const test = service.createTest(
      T,
      ADMIN,
      {
        title: 'Exam',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions(T, test.id, [q.id]);
    const attempt = service.startAttempt(
      T,
      learnerUser,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
      ctx
    );
    const wrong = service['state'].answerOptions.find(
      (o) => o.questionId === q.id && !o.isCorrect
    )!;
    service.saveAttemptAnswer(
      T,
      learnerUser,
      attempt.id,
      { questionId: q.id, answerOptionIds: [wrong.id] },
      ctx
    );
    service.submitAttempt(T, learnerUser, attempt.id, ctx);

    const summary = service.listMyTests(T, learnerUser)[0];
    expect(summary.status).toBe('failed');
    expect(summary.bestScore).toBe(0);
  });
});
