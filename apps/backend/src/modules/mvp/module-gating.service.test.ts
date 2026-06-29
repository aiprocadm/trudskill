import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

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

/** course → group → groupCourse → learner → enrollment → bank → version → 2 required modules (m1, m2), each one material. */
function seedTwoModuleCourse(
  service: MvpService,
  opts: { m1MinView?: number; m2Required?: boolean } = {}
) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
  const learner = service.createLearner(T, ADMIN, { code: 'L1', name: 'Jane Doe' }, ctx);
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);
  const version = service.createCourseVersion(T, course.id);
  const m1 = service.createModule(
    T,
    ADMIN,
    {
      courseVersionId: version.id,
      title: 'Module 1',
      minViewSeconds: opts.m1MinView ?? 0,
      isRequired: true
    },
    ctx
  );
  const m2 = service.createModule(
    T,
    ADMIN,
    {
      courseVersionId: version.id,
      title: 'Module 2',
      minViewSeconds: 0,
      isRequired: opts.m2Required ?? true
    },
    ctx
  );
  const mat1 = service.createMaterial(
    T,
    ADMIN,
    {
      moduleId: m1.id,
      title: 'Mat 1',
      materialType: 'text',
      minViewSeconds: opts.m1MinView ?? 0,
      isRequired: true
    },
    ctx
  );
  return { course, group, learner, enrollment, bank, version, m1, m2, mat1 };
}

/** Test bound to `moduleId` (or course-level if undefined); passingScore 0 ⇒ any submit passes. */
function makeTest(
  service: MvpService,
  courseId: string,
  bankId: string,
  moduleId: string | undefined,
  title: string
) {
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bankId,
      type: 'single_choice',
      title: `${title} Q`,
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
      courseId,
      questionBankId: bankId,
      title,
      ...(moduleId ? { moduleId } : {}),
      rules: { attemptLimit: 5, passingScore: 0 }
    },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  return test;
}

/** Start → finish an attempt → produces a passed ExamResult (passingScore 0). */
function passTest(
  service: MvpService,
  testId: string,
  enrollment: { id: string; learnerId: string }
) {
  const attempt = service.startAttempt(
    T,
    ADMIN,
    { testId, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
    ctx
  );
  service.finishAttempt(T, ADMIN, attempt.id, ctx);
}

describe('startAttempt — module gating (A) + min-view time (B)', () => {
  it('persists moduleId on a module test (Task 2 assertion)', () => {
    const service = makeService();
    const { course, bank, m1 } = seedTwoModuleCourse(service);
    const test = makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    expect(service.getTest(T, test.id).moduleId).toBe(m1.id);
  });

  it('does NOT gate a course-level test when no module has a gating test', () => {
    const service = makeService();
    const { course, bank, enrollment } = seedTwoModuleCourse(service);
    const finalTest = makeTest(service, course.id, bank.id, undefined, 'Final');
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: finalTest.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });

  it('scopes the course-level final-exam gate to published versions (a DRAFT version’s gating module must not lock learners out)', () => {
    const service = makeService();
    const course = service.createCourse(T, ADMIN, { code: 'CV', title: 'Versioned' }, ctx);
    const group = service.createGroup(T, ADMIN, { code: 'GV', name: 'Group V' }, ctx);
    service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
    const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);

    // v1 — the PUBLISHED version the learners are taking. Required module, no gating test.
    const v1 = service.createCourseVersion(T, course.id);
    (v1 as { status: string }).status = 'published';
    service.createModule(
      T,
      ADMIN,
      { courseVersionId: v1.id, title: 'v1 Module', minViewSeconds: 0, isRequired: true },
      ctx
    );

    // v2 — a DRAFT (work-in-progress) version with a required module that HAS a gating test.
    // Aggregating required modules across ALL versions (the bug) lets this not-yet-published
    // module retroactively lock every v1 learner out of the final exam.
    const v2 = service.createCourseVersion(T, course.id);
    const m2 = service.createModule(
      T,
      ADMIN,
      { courseVersionId: v2.id, title: 'v2 draft Module', minViewSeconds: 0, isRequired: true },
      ctx
    );
    makeTest(service, course.id, bank.id, m2.id, 'v2 gating');

    const learner = service.createLearner(T, ADMIN, { code: 'LV', name: 'V Learner' }, ctx);
    const enrollment = service.createEnrollment(
      T,
      ADMIN,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    const finalTest = makeTest(service, course.id, bank.id, undefined, 'Final');

    // The gate must consider only published v1 (no unpassed gating test) — the draft v2
    // module must not block.
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: finalTest.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });

  it('locks module-2 test until module-1 intermediate test is passed', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, m2 } = seedTwoModuleCourse(service);
    makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    const m2Test = makeTest(service, course.id, bank.id, m2.id, 'M2 test');
    expectThrowsCode(
      () =>
        service.startAttempt(
          T,
          ADMIN,
          { testId: m2Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
          ctx
        ),
      'module_gate_locked'
    );
  });

  it('unlocks module-2 test after module-1 test is passed', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, m2 } = seedTwoModuleCourse(service);
    const m1Test = makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    const m2Test = makeTest(service, course.id, bank.id, m2.id, 'M2 test');
    passTest(service, m1Test.id, enrollment);
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: m2Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });

  it('does NOT block when the prior module is not required (free transition)', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, m2 } = seedTwoModuleCourse(service, { m2Required: true });
    // Make m1 non-required by leaving its gating test, but flip isRequired via update path:
    service.updateModule(T, ADMIN, m1.id, { isRequired: false }, ctx);
    makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    const m2Test = makeTest(service, course.id, bank.id, m2.id, 'M2 test');
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: m2Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });

  it('isolates a group pinned to v1 from a later-published v2 required module (PINNED beats PUBLISHED)', () => {
    const service = makeService();
    const course = service.createCourse(T, ADMIN, { code: 'CP2', title: 'Pinned' }, ctx);
    const group = service.createGroup(T, ADMIN, { code: 'GP2', name: 'Group P' }, ctx);
    const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);

    // v1 published BEFORE attach → group auto-pins to v1.
    const v1 = service.createCourseVersion(T, course.id);
    (v1 as { status: string }).status = 'published';
    service.createModule(
      T,
      ADMIN,
      { courseVersionId: v1.id, title: 'v1 Module', minViewSeconds: 0, isRequired: true },
      ctx
    );
    const gc = service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
    expect(gc.courseVersionId).toBe(v1.id); // precondition: the pin landed

    // v2 published AFTER attach, with a required module behind an unpassed gating test.
    const v2 = service.createCourseVersion(T, course.id);
    (v2 as { status: string }).status = 'published';
    const m2 = service.createModule(
      T,
      ADMIN,
      { courseVersionId: v2.id, title: 'v2 Module', minViewSeconds: 0, isRequired: true },
      ctx
    );
    makeTest(service, course.id, bank.id, m2.id, 'v2 gating');

    const learner = service.createLearner(T, ADMIN, { code: 'LP', name: 'P Learner' }, ctx);
    const enrollment = service.createEnrollment(
      T,
      ADMIN,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const finalTest = makeTest(service, course.id, bank.id, undefined, 'Final');

    // Pinned to v1 → v2's gating module is out of scope → final exam is NOT locked.
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: finalTest.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });

  it('blocks the module test until the module min-view time is met, then allows it', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, mat1 } = seedTwoModuleCourse(service, { m1MinView: 120 });
    const m1Test = makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    // No study yet → blocked.
    expectThrowsCode(
      () =>
        service.startAttempt(
          T,
          ADMIN,
          { testId: m1Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
          ctx
        ),
      'min_view_not_met'
    );
    // Study 120s on the module's material → module progress meets the threshold.
    service.upsertMaterialProgress(
      T,
      ADMIN,
      mat1.id,
      { enrollmentId: enrollment.id, studiedSeconds: 120 },
      ctx
    );
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: m1Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).not.toThrow();
  });
});
