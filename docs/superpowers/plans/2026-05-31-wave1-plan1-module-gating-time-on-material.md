# Wave 1 · Plan 1 — Module Gating + Time-on-Material Implementation Plan

**✅ Status: DONE (2026-05-31)** — all 7 tasks implemented on branch `feat/2026-05-31-wave1-module-gating` via subagent-driven development with two-stage (spec + quality) reviews. Tests green: backend module-gating 6/6, DTO 97/97, regress business-flows 4/4 + test-player 11/11; frontend course-viewer 26/26; contracts 7/7; `tsc` 8/8. Details: handoff §5.96.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block a learner from starting an exam until the previous module's intermediate test is passed (sequential gating) and the module's minimum study time is met — enforced server-side in `startAttempt`, reflected in the course-viewer UI.

**Architecture:** All enforcement converges on one backend method, `MvpService.startAttempt` (`apps/backend/src/modules/mvp/mvp.service.ts:2728`). We link a test to a module via a new optional `TestEntity.moduleId`; a module is "passed" when its intermediate test has a passing `ExamResult`. Two new private guards (`assertMinViewGate`, `assertModuleSequenceGate`) run before attempt counting. The frontend reflects the same rules (lock icons + countdown) but the server stays the single source of truth, so the gate holds regardless of UI entry point (`/me/tests` or the course viewer).

**Tech Stack:** NestJS (request-scoped in-memory MVP state), TypeScript, Vitest, PostgreSQL migrations (numbered SQL), Next.js + React Query frontend.

**Source of truth for rules:** legacy FAQ §5 (модульность — next module blocked until intermediate test passed; non-required module ⇒ free transition), §7 (время на изучение — exam locked until module study time met; modules without a time set are not controlled).

---

## File Structure

**Backend (enforcement — the must-have core):**

- `apps/backend/migrations/0043_assessment_test_module_link.sql` — _Create._ Adds nullable `module_id` to `assessment.tests`.
- `apps/backend/src/modules/mvp/mvp.types.ts:276` — _Modify._ Add `moduleId?` to `TestEntity`.
- `apps/backend/src/modules/mvp/mvp.dto.ts:574` — _Modify._ Add `moduleId?` to `CreateTestRequest`.
- `apps/backend/src/modules/mvp/mvp.service.ts:2226` — _Modify._ Persist `moduleId` in `createTest`.
- `apps/backend/src/modules/mvp/mvp.service.ts:2766` — _Modify._ Insert two guard calls in `startAttempt`; add 5 private helpers below it.
- `apps/backend/src/modules/mvp/module-gating.service.test.ts` — _Create._ Service unit tests for both gates.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — _Modify._ `moduleId` validation.

**Frontend (reflect the gate):**

- `apps/frontend/src/features/mvp/types.ts` — _Modify._ Add `moduleId?` to the test interface returned by `listTests`.
- `apps/frontend/src/features/course-viewer/module-gate.ts` — _Create._ Pure helpers: `buildModuleGateState`, `computeModuleLocks`.
- `apps/frontend/src/features/course-viewer/module-gate.test.ts` — _Create._ Unit tests for the pure helpers.
- `apps/frontend/src/features/course-viewer/hooks.ts` — _Modify._ Add `useModuleGateState`.
- `apps/frontend/src/features/course-viewer/use-watch-tracker.ts:77` — _Modify._ Expose `onTick` in the hook args (for the countdown).
- `apps/frontend/src/features/course-viewer/course-viewer-screen.tsx` — _Modify._ Wire countdown + module locks.
- `apps/frontend/src/features/course-viewer/table-of-contents.tsx` — _Modify._ Render module-level lock.

**Testing note (Windows + Cyrillic path):** run single files with `--no-file-parallelism` (CLAUDE.md Gotchas). Never run the full backend suite locally.

---

## Task 1: DB migration — link a test to a module

**Files:**

- Create: `apps/backend/migrations/0043_assessment_test_module_link.sql`

- [x] **Step 1: Write the migration**

```sql
-- 0043_assessment_test_module_link.sql
-- Wave 1 (module gating): a test may act as the intermediate (gating) test of a
-- course module. Tests with NULL module_id are final/course-level exams.
-- Additive + nullable — safe on existing rows. Idempotent (IF NOT EXISTS).

BEGIN;

ALTER TABLE assessment.tests
  ADD COLUMN IF NOT EXISTS module_id text REFERENCES learning.course_modules(id);

CREATE INDEX IF NOT EXISTS tests_tenant_module_idx
  ON assessment.tests (tenant_id, module_id);

COMMIT;
```

- [x] **Step 2: Run the migration test suite to verify it applies**

Run: `pnpm test:migrations`
Expected: PASS (no SQL/ordering errors; `0043` applies cleanly after `0042`).

- [x] **Step 3: Commit**

```bash
git add apps/backend/migrations/0043_assessment_test_module_link.sql
git commit -m "feat(backend): add assessment.tests.module_id for module gating (Wave 1)"
```

---

## Task 2: Persist `moduleId` on tests (model + DTO + service + frontend mirror)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts:276`
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts:574`
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts:2226`
- Modify: `apps/frontend/src/features/mvp/types.ts` (the interface returned by `listTests`)
- Test: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`
- Test: `apps/backend/src/modules/mvp/module-gating.service.test.ts` (created in Task 3; the persist assertion lives there)

- [x] **Step 1: Write the failing DTO validation test**

Add to `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`:

```typescript
import { CreateTestRequest } from './mvp.dto.js';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('CreateTestRequest — moduleId', () => {
  it('accepts an optional moduleId string', () => {
    const dto = plainToInstance(CreateTestRequest, {
      courseId: 'c1',
      title: 'Module 1 test',
      moduleId: 'mod_1'
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.moduleId).toBe('mod_1');
  });

  it('accepts an omitted moduleId (course-level / final exam)', () => {
    const dto = plainToInstance(CreateTestRequest, { courseId: 'c1', title: 'Final' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.moduleId).toBeUndefined();
  });

  it('rejects an empty-string moduleId', () => {
    const dto = plainToInstance(CreateTestRequest, {
      courseId: 'c1',
      title: 'X',
      moduleId: ''
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism`
Expected: FAIL — `CreateTestRequest` has no `moduleId` property.

- [x] **Step 3: Add `moduleId` to `TestEntity`**

In `apps/backend/src/modules/mvp/mvp.types.ts`, inside `export interface TestEntity extends BaseEntity {` (line 276), add after `courseId: string;`:

```typescript
  /** Wave 1: when set, this test is the intermediate (gating) test of the module. Null ⇒ final/course exam. */
  moduleId?: string;
```

- [x] **Step 4: Add `moduleId` to `CreateTestRequest`**

In `apps/backend/src/modules/mvp/mvp.dto.ts`, inside `export class CreateTestRequest {` (line 574), add after the `courseId` field:

```typescript
  @IsOptional()
  @IsString()
  @MinLength(1)
  moduleId?: string;
```

- [x] **Step 5: Persist `moduleId` in `createTest`**

In `apps/backend/src/modules/mvp/mvp.service.ts`, in `createTest` (line 2226), add `moduleId: request.moduleId,` to the `entity` object literal, right after `courseId: request.courseId,`:

```typescript
const entity: TestEntity = {
  id: this.id('test'),
  tenantId,
  courseId: request.courseId,
  moduleId: request.moduleId,
  title: request.title,
  description: request.description,
  questionBankId: request.questionBankId,
  rules: this.normalizeTestRules(request.rules),
  isArchived: false,
  status: 'draft',
  createdAt: this.now(),
  updatedAt: this.now()
};
```

- [x] **Step 6: Mirror `moduleId` on the frontend test type**

In `apps/frontend/src/features/mvp/types.ts`, find the interface used as the element type of `listTests` (the test type with `courseId`, `title`, `rules`). Add after its `courseId` field:

```typescript
  /** Wave 1: gating module for this test (undefined ⇒ final/course exam). */
  moduleId?: string;
```

- [x] **Step 7: Run the DTO test + typecheck**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism`
Expected: PASS.
Run: `pnpm typecheck`
Expected: PASS (8/8 tasks).

- [x] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts apps/frontend/src/features/mvp/types.ts
git commit -m "feat(backend): persist test.moduleId; mirror on frontend type (Wave 1)"
```

---

## Task 3: The gates — `startAttempt` enforces module sequence + min-view time

**Files:**

- Create: `apps/backend/src/modules/mvp/module-gating.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`startAttempt` at 2766 + 5 private helpers)

- [x] **Step 1: Write the failing service test file**

Create `apps/backend/src/modules/mvp/module-gating.service.test.ts`:

```typescript
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

  it('locks module-2 test until module-1 intermediate test is passed', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, m2 } = seedTwoModuleCourse(service);
    makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    const m2Test = makeTest(service, course.id, bank.id, m2.id, 'M2 test');
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: m2Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).toThrowError(/module_gate_locked/);
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

  it('blocks the module test until the module min-view time is met, then allows it', () => {
    const service = makeService();
    const { course, bank, enrollment, m1, mat1 } = seedTwoModuleCourse(service, { m1MinView: 120 });
    const m1Test = makeTest(service, course.id, bank.id, m1.id, 'M1 test');
    // No study yet → blocked.
    expect(() =>
      service.startAttempt(
        T,
        ADMIN,
        { testId: m1Test.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
        ctx
      )
    ).toThrowError(/min_view_not_met/);
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
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/module-gating.service.test.ts --no-file-parallelism`
Expected: FAIL — the `module_gate_locked` and `min_view_not_met` cases do NOT throw (gates not implemented yet). The `not.toThrow` cases pass.

- [x] **Step 3: Add the 5 private helpers**

In `apps/backend/src/modules/mvp/mvp.service.ts`, add these methods immediately AFTER the `startAttempt` method (after line 2826, before `saveAnswer`). They use only types already imported in the file (`TestEntity`, `CourseModuleEntity`, `PreconditionFailedException`).

```typescript
  /** The intermediate (gating) test of a module, if any. */
  private getModuleGatingTest(tenantId: string, moduleId: string): TestEntity | undefined {
    return this.state.tests.find(
      (t) => t.tenantId === tenantId && t.moduleId === moduleId && !t.isArchived
    );
  }

  /** Whether the learner already has a passing ExamResult for the given test. */
  private isExamPassed(tenantId: string, enrollmentId: string, testId: string): boolean {
    return this.state.examResults.some(
      (er) =>
        er.tenantId === tenantId &&
        er.enrollmentId === enrollmentId &&
        er.testId === testId &&
        er.passed === true
    );
  }

  /** Required modules that must be passed before the given test can start. */
  private requiredPriorModules(tenantId: string, test: TestEntity): CourseModuleEntity[] {
    if (test.moduleId) {
      const current = this.getById(this.state.modules, tenantId, test.moduleId);
      return this.state.modules.filter(
        (m) =>
          m.tenantId === tenantId &&
          m.courseVersionId === current.courseVersionId &&
          m.isRequired &&
          m.sortOrder < current.sortOrder
      );
    }
    // Final/course-level exam: all required modules of the course must be passed.
    const versionIds = this.state.courseVersions
      .filter((v) => v.tenantId === tenantId && v.courseId === test.courseId)
      .map((v) => v.id);
    return this.state.modules.filter(
      (m) => m.tenantId === tenantId && versionIds.includes(m.courseVersionId) && m.isRequired
    );
  }

  /** Feature A: block until every required prior module with a gating test has been passed. */
  private assertModuleSequenceGate(tenantId: string, enrollmentId: string, test: TestEntity): void {
    for (const prior of this.requiredPriorModules(tenantId, test)) {
      const gating = this.getModuleGatingTest(tenantId, prior.id);
      if (gating && !this.isExamPassed(tenantId, enrollmentId, gating.id)) {
        throw new PreconditionFailedException({
          code: 'module_gate_locked',
          message: `Module "${prior.title}" intermediate test must be passed first`
        });
      }
    }
  }

  /** Feature B: block a module test until the module's minimum study time is met. */
  private assertMinViewGate(tenantId: string, enrollmentId: string, test: TestEntity): void {
    if (!test.moduleId) return;
    const moduleEntity = this.getById(this.state.modules, tenantId, test.moduleId);
    if (moduleEntity.minViewSeconds <= 0) return;
    const progress = this.state.moduleProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleEntity.id
    );
    const studied = progress?.studiedSeconds ?? 0;
    if (studied < moduleEntity.minViewSeconds) {
      throw new PreconditionFailedException({
        code: 'min_view_not_met',
        message: `Minimum study time not met (${moduleEntity.minViewSeconds - studied}s remaining)`
      });
    }
  }
```

- [x] **Step 4: Wire the two gates into `startAttempt`**

In `apps/backend/src/modules/mvp/mvp.service.ts`, find this block in `startAttempt` (around line 2752-2766):

```typescript
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
```

Insert the two guard calls right after the `assertActorMatchesLearnerIamLink(...)` call and before `const delegationAuditMetadata`:

```typescript
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    // Wave 1 gates: министудия времени (B) и последовательность модулей (A).
    this.assertMinViewGate(tenantId, enrollment.id, test);
    this.assertModuleSequenceGate(tenantId, enrollment.id, test);
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
```

- [x] **Step 5: Run the gating test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/module-gating.service.test.ts --no-file-parallelism`
Expected: PASS (all 6 cases).

- [x] **Step 6: Run the existing test-player + canonical e2e to confirm no regression**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/test-player.service.test.ts --no-file-parallelism`
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS for both (course-level tests with no module gating tests are unaffected).

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/module-gating.service.test.ts
git commit -m "feat(backend): gate startAttempt by module sequence + min-view time (Wave 1)"
```

---

## Task 4: Frontend — module-gate data hook

**Files:**

- Modify: `apps/frontend/src/features/course-viewer/hooks.ts`

- [x] **Step 1: Add `useModuleGateState` (no test — thin React Query wrapper, covered by Task 5's pure helper)**

In `apps/frontend/src/features/course-viewer/hooks.ts`, add this hook (it loads the learner's exam results + the course's tests, then delegates the pure computation to `buildModuleGateState` from Task 5). Add the import at the top:

```typescript
import { buildModuleGateState } from './module-gate';
import type { ModuleGateState } from './module-gate';
```

Then add the hook:

```typescript
export const useModuleGateState = (
  courseId: string,
  enrollmentId: string | null
): { gate: ModuleGateState; loading: boolean } => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['mvp', 'moduleGate', courseId, enrollmentId],
    enabled: Boolean(session) && Boolean(courseId) && Boolean(enrollmentId),
    queryFn: async () => {
      const [tests, exams] = await Promise.all([
        mvpApi.listTests(session!, { course_id: courseId, page: 1, page_size: 200 }),
        mvpApi.listExamResults(session!, { enrollment_id: enrollmentId!, page: 1, page_size: 200 })
      ]);
      return buildModuleGateState(tests.items, exams.items);
    }
  });
  return { gate: query.data ?? new Map(), loading: query.isLoading };
};
```

- [x] **Step 2: Typecheck (will fail until Task 5 creates `module-gate.ts`)**

This task depends on Task 5's module. Implement Task 5 next, then run:
Run: `pnpm typecheck`
Expected: PASS after Task 5.

- [x] **Step 3: Commit (after Task 5 lands — or commit together)**

```bash
git add apps/frontend/src/features/course-viewer/hooks.ts
git commit -m "feat(frontend): load module-gate state (tests + exam results) (Wave 1)"
```

---

## Task 5: Frontend — pure module-lock helpers + unit tests

**Files:**

- Create: `apps/frontend/src/features/course-viewer/module-gate.ts`
- Create: `apps/frontend/src/features/course-viewer/module-gate.test.ts`

- [x] **Step 1: Write the failing unit test**

Create `apps/frontend/src/features/course-viewer/module-gate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { buildModuleGateState, computeModuleLocks } from './module-gate';

import type { CourseTree } from './types';

const tree: CourseTree = [
  {
    module: {
      id: 'm1',
      courseVersionId: 'v1',
      title: 'M1',
      sortOrder: 1,
      minViewSeconds: 0,
      isRequired: true,
      status: 'active',
      tenantId: 't',
      createdAt: '',
      updatedAt: ''
    },
    materials: []
  },
  {
    module: {
      id: 'm2',
      courseVersionId: 'v1',
      title: 'M2',
      sortOrder: 2,
      minViewSeconds: 0,
      isRequired: true,
      status: 'active',
      tenantId: 't',
      createdAt: '',
      updatedAt: ''
    },
    materials: []
  }
];

describe('buildModuleGateState', () => {
  it('maps a module to its gating test and its passed flag', () => {
    const tests = [{ id: 'test_m1', moduleId: 'm1', courseId: 'c1' }] as never[];
    const exams = [{ testId: 'test_m1', passed: true }] as never[];
    const gate = buildModuleGateState(tests, exams);
    expect(gate.get('m1')).toEqual({ gatingTestId: 'test_m1', passed: true });
  });

  it('reports passed=false when the module has a gating test but no passing exam result', () => {
    const tests = [{ id: 'test_m1', moduleId: 'm1', courseId: 'c1' }] as never[];
    const gate = buildModuleGateState(tests, []);
    expect(gate.get('m1')).toEqual({ gatingTestId: 'test_m1', passed: false });
  });
});

describe('computeModuleLocks', () => {
  it('locks module 2 while module 1 (required, has gating test) is not passed', () => {
    const gate = new Map([['m1', { gatingTestId: 'test_m1', passed: false }]]);
    const locks = computeModuleLocks(tree, gate);
    expect(locks.get('m1')).toBe('unlocked');
    expect(locks.get('m2')).toBe('locked');
  });

  it('unlocks module 2 once module 1 is passed', () => {
    const gate = new Map([['m1', { gatingTestId: 'test_m1', passed: true }]]);
    const locks = computeModuleLocks(tree, gate);
    expect(locks.get('m2')).toBe('unlocked');
  });

  it('does not lock when the prior module has no gating test', () => {
    const locks = computeModuleLocks(tree, new Map());
    expect(locks.get('m2')).toBe('unlocked');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/course-viewer/module-gate.test.ts --no-file-parallelism`
Expected: FAIL — `./module-gate` does not exist.

- [x] **Step 3: Implement the pure helpers**

Create `apps/frontend/src/features/course-viewer/module-gate.ts`:

```typescript
import type { CourseTree, LockState, LockStatus } from './types';

/** Per-module: its gating test id (if any) and whether the learner passed it. */
export interface ModuleGateInfo {
  gatingTestId?: string;
  passed: boolean;
}

export type ModuleGateState = Map<string, ModuleGateInfo>;

interface TestLike {
  id: string;
  moduleId?: string;
}
interface ExamResultLike {
  testId: string;
  passed: boolean;
}

/** Build the per-module gate state from the course's tests and the learner's exam results. */
export const buildModuleGateState = (
  tests: TestLike[],
  examResults: ExamResultLike[]
): ModuleGateState => {
  const passedTestIds = new Set(examResults.filter((e) => e.passed).map((e) => e.testId));
  const state: ModuleGateState = new Map();
  for (const test of tests) {
    if (!test.moduleId) continue;
    state.set(test.moduleId, { gatingTestId: test.id, passed: passedTestIds.has(test.id) });
  }
  return state;
};

/**
 * A module is locked when a required earlier module (by sortOrder) has a gating
 * test that has not been passed. Mirrors the server-side assertModuleSequenceGate.
 */
export const computeModuleLocks = (tree: CourseTree, gate: ModuleGateState): LockState => {
  const locks: LockState = new Map();
  const orderedModules = [...tree].sort((a, b) => a.module.sortOrder - b.module.sortOrder);
  let priorGateOpen = true;
  for (const node of orderedModules) {
    const status: LockStatus = priorGateOpen ? 'unlocked' : 'locked';
    locks.set(node.module.id, status);
    const info = gate.get(node.module.id);
    const blocks =
      node.module.isRequired && info?.gatingTestId !== undefined && info.passed === false;
    if (blocks) priorGateOpen = false;
  }
  return locks;
};
```

- [x] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/course-viewer/module-gate.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/course-viewer/module-gate.ts apps/frontend/src/features/course-viewer/module-gate.test.ts apps/frontend/src/features/course-viewer/hooks.ts
git commit -m "feat(frontend): pure module-lock helpers + module-gate hook (Wave 1)"
```

---

## Task 6: Frontend — countdown (B) + module lock in the TOC (A)

**Files:**

- Modify: `apps/frontend/src/features/course-viewer/use-watch-tracker.ts:77`
- Modify: `apps/frontend/src/features/course-viewer/course-viewer-screen.tsx`
- Modify: `apps/frontend/src/features/course-viewer/table-of-contents.tsx`

- [x] **Step 1: Expose `onTick` in the `useWatchTracker` hook args**

In `apps/frontend/src/features/course-viewer/use-watch-tracker.ts`, extend `UseWatchTrackerArgs` (line 77) and wire it through. Replace the `interface UseWatchTrackerArgs { ... }` and the `useWatchTracker` body with:

```typescript
interface UseWatchTrackerArgs {
  materialId: string | null;
  minViewSeconds: number;
  flushIntervalMs?: number | undefined;
  onFlush?: ((studiedSeconds: number) => void) | undefined;
  onMinimumReached?: (() => void) | undefined;
  onTick?: ((studiedSeconds: number) => void) | undefined;
}

export const useWatchTracker = ({
  materialId,
  minViewSeconds,
  flushIntervalMs,
  onFlush,
  onMinimumReached,
  onTick
}: UseWatchTrackerArgs): void => {
  const onFlushRef = useRef(onFlush);
  const onMinimumReachedRef = useRef(onMinimumReached);
  const onTickRef = useRef(onTick);
  onFlushRef.current = onFlush;
  onMinimumReachedRef.current = onMinimumReached;
  onTickRef.current = onTick;

  useEffect(() => {
    if (!materialId) return;
    const tracker = createWatchTracker({
      minViewSeconds,
      flushIntervalMs,
      onTick: (s) => onTickRef.current?.(s),
      onFlush: (s) => onFlushRef.current?.(s),
      onMinimumReached: () => onMinimumReachedRef.current?.()
    });
    tracker.start();
    return () => tracker.stop();
  }, [materialId, minViewSeconds, flushIntervalMs]);
};
```

- [x] **Step 2: Wire countdown + module locks into the screen**

In `apps/frontend/src/features/course-viewer/course-viewer-screen.tsx`:

(a) Add imports near the existing ones:

```typescript
import { computeModuleLocks } from './module-gate';
import { useModuleGateState } from './hooks';
```

(b) After the `upsertProgress` line (line 57), add gate state + a live countdown:

```typescript
const { gate: moduleGate } = useModuleGateState(courseId, enrollmentId);
const moduleLocks = useMemo(() => computeModuleLocks(tree ?? [], moduleGate), [tree, moduleGate]);
const [studiedSeconds, setStudiedSeconds] = useState(0);
useEffect(() => {
  setStudiedSeconds(0);
}, [currentMaterialId]);
const remainingSeconds = Math.max(0, (currentMaterial?.minViewSeconds ?? 0) - studiedSeconds);
```

(c) Replace the existing `useWatchTracker({ ... })` call (lines 105-109) with one that also ticks the countdown:

```typescript
useWatchTracker({
  materialId: enrollmentId ? currentMaterialId : null,
  minViewSeconds: currentMaterial?.minViewSeconds ?? 30,
  onFlush: handleFlush,
  onTick: setStudiedSeconds
});
```

(d) Pass `moduleLocks` to `TableOfContents` (in the JSX, line 143-149):

```typescript
          <TableOfContents
            tree={tree}
            progressByMaterial={progressByMaterial}
            lockState={lockState}
            moduleLocks={moduleLocks}
            currentMaterialId={currentMaterialId}
            onSelect={setCurrentMaterialId}
          />
```

(e) Show the countdown inside the player section, just above `<MaterialPlayer .../>` (line 152):

```typescript
            {currentMaterial && remainingSeconds > 0 ? (
              <p className="ui-text-muted" data-testid="course-min-view-countdown">
                До открытия экзамена модуля осталось изучать: {remainingSeconds} с
              </p>
            ) : null}
```

- [x] **Step 3: Render module-level lock in the TOC**

In `apps/frontend/src/features/course-viewer/table-of-contents.tsx`:

(a) Add `moduleLocks` to `Props` (after `lockState`):

```typescript
moduleLocks: LockState;
```

(b) Destructure it in the component signature (add `moduleLocks,` after `lockState,`).

(c) Inside the `tree.map((node) => {` body, compute the module lock and reflect it. Replace the `const completed = ...` line and the `<summary>` block with:

```typescript
        const completed = node.materials.filter(
          (m) => progressByMaterial.get(m.id)?.status === 'completed'
        ).length;
        const moduleLocked = moduleLocks.get(node.module.id) === 'locked';
        return (
          <details
            key={node.module.id}
            open={!moduleLocked}
            className={`course-toc__module${moduleLocked ? ' course-toc__module--locked' : ''}`}
            data-testid={`course-toc-module-${node.module.id}`}
          >
            <summary className="course-toc__module-summary">
              <span className="course-toc__module-title">
                {moduleLocked ? '🔒 ' : ''}
                {node.module.title}
              </span>
              <span className="course-toc__module-counter ui-text-muted">
                {moduleProgress(node.materials.length, completed)}
              </span>
            </summary>
```

(d) When a module is locked, also force its materials locked. In the inner `node.materials.map`, change the `const lock = ...` line to:

```typescript
const lock = moduleLocked ? 'locked' : (lockState.get(material.id) ?? 'locked');
```

- [x] **Step 4: Typecheck + lint the touched files**

Run: `pnpm typecheck`
Expected: PASS (8/8).
Run: `npx eslint apps/frontend/src/features/course-viewer/use-watch-tracker.ts apps/frontend/src/features/course-viewer/course-viewer-screen.tsx apps/frontend/src/features/course-viewer/table-of-contents.tsx --max-warnings=0`
Expected: clean.

- [x] **Step 5: Run the frontend course-viewer tests to confirm no regression**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/course-viewer --no-file-parallelism`
Expected: PASS (existing lock-logic/material tests + new module-gate test).

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/features/course-viewer/use-watch-tracker.ts apps/frontend/src/features/course-viewer/course-viewer-screen.tsx apps/frontend/src/features/course-viewer/table-of-contents.tsx
git commit -m "feat(frontend): module lock in TOC + min-view countdown (Wave 1)"
```

---

## Task 7: Full regression gate + docs sync

**Files:**

- Modify: `README.md` §2 (AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` §5 (append next `### 5.XX`)
- Modify: `docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md` (tick Plan 1)

- [x] **Step 1: Run the quality gate**

Run: `pnpm -s ci:check`
Expected: PASS (lint + typecheck + contracts + unit + build). If the full backend suite crashes on the Cyrillic path (CLAUDE.md Gotchas), rely on the isolated runs from Tasks 2-6 + CI; note this in the handoff.

- [x] **Step 2: Update README §2** — set Last Completed Task to "Wave 1 Plan 1 — module gating + time-on-material", Current/Next Task to "Wave 1 Plan 2 — pre-exam auth (№816)", Last Updated At/By.

- [x] **Step 3: Append `### 5.XX` to LMS_AGENT_HANDOFF.md** — summary, files changed, test status (which isolated suites are green), deviations; cross-link this plan + the design spec.

- [x] **Step 4: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md
git commit -m "docs(handoff): Wave 1 Plan 1 — module gating + time-on-material"
```

---

## Self-Review

**Spec coverage** (against `2026-05-30-wave1-module-gating-pre-exam-auth-design.md` §3.A + §3.B):

- §3.A model `TestEntity.moduleId` + migration → Tasks 1-2. ✅
- §3.A sequence gate (prior required module's intermediate test passed; non-required ⇒ free) → Task 3 `assertModuleSequenceGate` + tests (lock/unlock/non-required). ✅
- §3.A methodist exception (gate only in learner flow) → satisfied structurally: gates live only in `startAttempt` (learner attempt path); admin preview never calls it. ✅
- §3.A frontend module locks → Tasks 4-6. ✅
- §3.B min-view gate (module `minViewSeconds`; `0` ⇒ no control) → Task 3 `assertMinViewGate` + test (blocked then allowed). ✅
- §3.B countdown UI → Task 6 (`onTick` + countdown). ✅
- §4 reuse `assessment.attempts.take` / no new permission → no permission task needed. ✅
- §4 tests trio + e2e regression → Tasks 2-3, 5-6 + Task 7 `ci:check`. ✅

**Out of scope here (Plan 2):** pre-exam auth №816, `pre_exam_tokens`, `GroupCourse.requiresPreExamAuth`. Not referenced by any task above — correct.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✅

**Type/name consistency:** `moduleId` (model+DTO+frontend), `assertMinViewGate` / `assertModuleSequenceGate` / `getModuleGatingTest` / `isExamPassed` / `requiredPriorModules` (used consistently in Task 3), `buildModuleGateState` / `computeModuleLocks` / `ModuleGateState` (Tasks 4-5-6), `moduleLocks` prop (Task 6 screen ↔ TOC). ✅

**Known assumptions to verify during execution (TDD will surface):**

- `createModule` auto-assigns `sortOrder` by creation order (no `sortOrder` in `CreateModuleRequest`); the gate relies on m1.sortOrder < m2.sortOrder. If creation order ≠ sortOrder, adjust the seed.
- `service.getTest` / `service.updateModule` exist (used in Task 3 tests). If a getter has a different name, adjust.
- Frontend `mvpApi.listExamResults` filter key is `enrollment_id` and `listTests` is `course_id` (confirmed in `features/mvp/api.ts`).
