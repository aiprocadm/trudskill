import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { hashPreExamToken } from './pre-exam-token.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/** Assert that fn throws a NestJS HTTP exception whose response.code matches the given code string. */
function expectThrowsCode(fn: () => unknown, code: string): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err, `expected a throw with code ${code}`).toBeDefined();
  expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ code });
}

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

/** course → group → groupCourse(requiresPreExamAuth) → learner → enrollment → bank → final test (no moduleId). */
function seedFinalExam(service: MvpService, requiresPreExamAuth: boolean) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id, requiresPreExamAuth });
  const learner = service.createLearner(T, ADMIN, { code: 'L1', name: 'Jane Doe' }, ctx);
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bank.id,
      type: 'single_choice',
      title: 'Q',
      score: 1,
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false }
      ]
    } as never,
    ctx
  );
  const test = service.createTest(
    T,
    ADMIN,
    { courseId: course.id, questionBankId: bank.id, title: 'Final', rules: { attemptLimit: 5 } },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  return { course, group, learner, enrollment, test };
}

/** Like seedFinalExam(requires=true) but the test is a MODULE (intermediate) test (moduleId set). */
function seedModuleExam(service: MvpService) {
  const course = service.createCourse(T, ADMIN, { code: 'C2', title: 'Course 2' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G2', name: 'Group 2' }, ctx);
  service.createGroupCourse(T, {
    groupId: group.id,
    courseId: course.id,
    requiresPreExamAuth: true
  });
  const learner = service.createLearner(T, ADMIN, { code: 'L2', name: 'John Roe' }, ctx);
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank2', courseId: course.id }, ctx);
  const version = service.createCourseVersion(T, course.id);
  const m1 = service.createModule(
    T,
    ADMIN,
    { courseVersionId: version.id, title: 'Module 1', minViewSeconds: 0, isRequired: true },
    ctx
  );
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bank.id,
      type: 'single_choice',
      title: 'Q',
      score: 1,
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false }
      ]
    } as never,
    ctx
  );
  const test = service.createTest(
    T,
    ADMIN,
    {
      courseId: course.id,
      questionBankId: bank.id,
      title: 'Module 1 test',
      moduleId: m1.id,
      rules: { attemptLimit: 5 }
    },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  return { course, group, learner, enrollment, test, m1 };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

describe('pre-exam auth (C) — gate, request, verify', () => {
  it('does NOT gate when the group-course does not require pre-exam auth', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, false);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('blocks the final exam with pre_exam_auth_required until verified', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    expectThrowsCode(
      () => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx),
      'pre_exam_auth_required'
    );
  });

  it('issues a token without leaking the raw token in the response', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const out = service.requestPreExamToken(T, ADMIN, startArgs(test, enrollment), ctx) as Record<
      string,
      unknown
    >;
    expect(out.delivered).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/token["']?\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    // exactly one pending token stored, hash-only
    const stored = new InMemoryMvpStatePeek(service).preExamTokens();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.consumedAt).toBeUndefined();
    expect(stored[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies a token and then allows the attempt (records identity on it)', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx); // test-only raw accessor
    // hash-only storage: the stored token is the SHA-256 of the raw value (raw never persisted).
    const stored = new InMemoryMvpStatePeek(service).preExamTokens();
    expect(stored[0]!.tokenHash).toBe(hashPreExamToken(raw));
    service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx);
    const attempt = service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    expect(attempt.identityVerifiedAt).toBeTruthy();
    expect(attempt.identityVerificationTokenId).toBeTruthy();
  });

  it('does not re-prompt repeat attempts of the same exam after verification', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx);
    service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx);
    const a1 = service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    service.finishAttempt(T, ADMIN, a1.id, ctx);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('rejects an unknown token', () => {
    const service = makeService();
    seedFinalExam(service, true);
    expectThrowsCode(
      () => service.verifyPreExamToken(T, ADMIN, { token: 'nope' }, ctx),
      'pre_exam_token_invalid'
    );
  });

  it('does NOT gate a MODULE (intermediate) test even when the group requires pre-exam auth', () => {
    const service = makeService();
    const { test, enrollment } = seedModuleExam(service);
    // moduleId is set → identity gate is bypassed (Приказ №816 targets the final exam only).
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('rejects an expired token', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx);
    // Force the stored token past its TTL, then try to redeem it.
    const stored = new InMemoryMvpStatePeek(service).preExamTokens();
    stored[0]!.expiresAt = new Date(Date.now() - 60_000).toISOString();
    expectThrowsCode(
      () => service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx),
      'pre_exam_token_expired'
    );
  });

  it('reports alreadyVerified on a second request once verified (no re-prompt)', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx);
    service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx);
    const again = service.requestPreExamToken(T, ADMIN, startArgs(test, enrollment), ctx);
    expect(again).toMatchObject({ delivered: true, alreadyVerified: true });
  });
});

/** Minimal reflection helper to read the private state collection in assertions. */
class InMemoryMvpStatePeek {
  constructor(private readonly service: MvpService) {}
  preExamTokens() {
    return (this.service as unknown as { state: InMemoryMvpState }).state.preExamTokens;
  }
}
