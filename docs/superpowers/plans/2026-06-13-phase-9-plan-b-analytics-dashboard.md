# Phase 9 Plan B — Admin Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin analytics dashboard — a read-only `GET /reports/analytics-dashboard` endpoint returning completion rate, exam pass rate, average completion time, average score, attempts-to-pass distribution and drop-off, plus per-course/per-group breakdown rows — and an `/admin/analytics` page that renders KPI cards, two bar charts and drill-down tables with a `course_id` / `group_id` / `client_id` / date filter bar.

**Architecture:** Mirror the existing `kpiSnapshot` read-model (`apps/backend/src/modules/mvp/mvp.service.ts:1426`): a **pure aggregator function** over the in-memory MVP state (no new collection, no migration, no new permission — reuse `enrollments.read`). The backend exposes one new GET endpoint; the frontend adds a feature module (`features/analytics/`) and one page. Charts are **dependency-free inline SVG** built from pure geometry functions (see Deviation D-B1) rather than recharts.

**Tech Stack:** NestJS (request-scoped `MvpService`), `packages/api-contracts` hand-written contracts, Next.js 15 App Router client page, Vitest (no React Testing Library — e2e = permission-routing + dynamic-import smoke), `@cdoprof/ui` `DataTable`/`FilterBar`, design tokens from `packages/ui`.

**Deviation D-B1 (recharts → inline SVG):** Spec §11 recommends `recharts`. This repo has a documented heavy-dynamic-import smoke-test fragility class (see `project_phase_9_scorm` handoff: "6 падений = известный environmental dynamic-import класс") and the owner prioritises the design-token system + readability. We instead render bar charts as small inline-SVG components driven by **pure layout functions** (`computeBarChartLayout`) that are unit-tested. This avoids a heavy new dependency, keeps charts token-themed, and makes chart geometry testable. Documented here for PR-level review; recharts can be swapped in later if richer interactivity is required.

**Parallelization note (for dispatcher):** Task 1 freezes the shared contract and MUST land first. After Task 1, the **Backend track (Tasks 2–3)** and the **Frontend track (Tasks 4–5)** are independent problem domains with no shared files and can be dispatched to parallel agents. Task 6 (integration verification) runs last, after both tracks merge.

---

## File Structure

**Backend:**

- `apps/backend/src/modules/mvp/analytics-dashboard.ts` — **NEW**, pure aggregator `computeAnalyticsDashboard(input)` + helpers. One responsibility: turn scoped arrays into the DTO.
- `apps/backend/src/modules/mvp/analytics-dashboard.test.ts` — **NEW**, unit tests for the pure aggregator.
- `apps/backend/src/modules/mvp/mvp.types.ts` — **MODIFY**, add `AnalyticsDashboardDto` + sub-types.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — **MODIFY**, add `client_id?` to `BaseFilterQuery`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — **MODIFY**, add thin `getAnalyticsDashboard` adapter.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — **MODIFY**, add `GET reports/analytics-dashboard`.
- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — **MODIFY**, add permission-boundary case.

**Contracts:**

- `packages/api-contracts/src/domains/mvp-metrics/contracts.ts` — **MODIFY**, mirror the DTO for the frontend.

**Frontend:**

- `apps/frontend/src/features/analytics/types.ts` — **NEW**, `AnalyticsDashboard` + `AnalyticsFilterQuery`.
- `apps/frontend/src/features/analytics/api.ts` — **NEW**, `getAnalyticsDashboard`.
- `apps/frontend/src/features/analytics/hooks.ts` — **NEW**, `useAnalyticsDashboard`.
- `apps/frontend/src/features/analytics/format.ts` — **NEW**, pure formatting + `computeBarChartLayout`.
- `apps/frontend/src/features/analytics/format.test.ts` — **NEW**, unit tests for pure helpers.
- `apps/frontend/src/features/analytics/charts.tsx` — **NEW**, inline-SVG `BarChart` component (client-only, NOT imported by e2e smoke).
- `apps/frontend/src/features/analytics/screens.tsx` — **NEW**, `AnalyticsDashboardScreen`.
- `apps/frontend/src/features/analytics/api.contract.test.ts` — **NEW**, envelope-unwrap contract test.
- `apps/frontend/app/admin/analytics/page.tsx` — **NEW**, route shell.
- `apps/frontend/src/features/navigation/model.ts` — **MODIFY**, add `/admin/analytics` routeMeta + nav entry.
- `apps/frontend/src/e2e/analytics-dashboard.e2e.test.ts` — **NEW**, route-access + screen smoke.

---

## Task 1: Freeze the shared contract (DTO + query param)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (after `KpiSnapshotDto`, ~line 172)
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts:29-55` (`BaseFilterQuery`)
- Modify: `packages/api-contracts/src/domains/mvp-metrics/contracts.ts` (append)
- Modify: `apps/frontend/src/features/analytics/types.ts` is created in Task 4 — here we only do backend + contracts.

- [ ] **Step 1: Add the DTO types to backend `mvp.types.ts`**

Insert after the `KpiSnapshotDto` interface block:

```ts
/** Phase 9 Plan B — строка разбивки дашборда по курсу или группе. */
export interface AnalyticsBreakdownRow {
  /** courseId (для byCourse) или groupId (для byGroup). */
  key: string;
  /** Название курса / группы (или key, если сущность не найдена). */
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  /** 0..1 */
  completionRate: number;
  /** 0..1 */
  examPassRate: number;
  /** 0..1, либо null если нет оценённых экзаменов в строке. */
  averageScorePercent: number | null;
}

/** Phase 9 Plan B — распределение «с какой попытки сдан экзамен». */
export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

/** Phase 9 Plan B — сводка дашборда аналитики администратора. */
export interface AnalyticsDashboardDto {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  /** 0..1 */
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  /** 0..1 */
  examPassRate: number;
  /** Средний срок прохождения (дни, enrolledAt→completedAt) по завершённым; null если завершённых нет. */
  averageCompletionDays: number | null;
  /** Средний балл как доля от максимума (0..1); null если нет оценённых экзаменов. */
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  /** Активные зачисления без активности дольше порога. */
  dropOffCount: number;
  /** Порог неактивности в днях (эхо для UI). */
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}
```

- [ ] **Step 2: Add `client_id` to `BaseFilterQuery`**

In `mvp.dto.ts`, inside `BaseFilterQuery`, add after `course_version_id?: string;`:

```ts
  /** Phase 9 Plan B — фильтр по компании-заказчику (group.counterpartyId). */
  client_id?: string;
```

- [ ] **Step 3: Mirror the DTO in the api-contracts package**

Append to `packages/api-contracts/src/domains/mvp-metrics/contracts.ts`:

```ts
/** Phase 9 Plan B — строка разбивки дашборда аналитики. */
export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examPassRate: number;
  averageScorePercent: number | null;
}

export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

export interface AnalyticsDashboardDto {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  averageCompletionDays: number | null;
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  dropOffCount: number;
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}
```

- [ ] **Step 4: Typecheck the two packages**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` and `pnpm --filter @cdoprof/api-contracts exec tsc --noEmit`
Expected: PASS (new types are not yet referenced anywhere, so this only checks they parse).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.dto.ts packages/api-contracts/src/domains/mvp-metrics/contracts.ts
git commit -m "feat(backend): Phase 9 Plan B contract — AnalyticsDashboardDto + client_id filter"
```

---

## Task 2: Pure aggregator `computeAnalyticsDashboard` (Backend track)

**Files:**

- Create: `apps/backend/src/modules/mvp/analytics-dashboard.ts`
- Test: `apps/backend/src/modules/mvp/analytics-dashboard.test.ts`

**Depends on:** Task 1. **Parallel-safe with:** Task 4, Task 5.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/modules/mvp/analytics-dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeAnalyticsDashboard } from './analytics-dashboard.js';
import type { Course, Enrollment, ExamResult, GroupCourse, GroupEntity } from './mvp.types.js';

const base = { tenantId: 't1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };

function enrollment(p: Partial<Enrollment> & { id: string }): Enrollment {
  return {
    ...base,
    groupId: 'g1',
    learnerId: 'l1',
    status: 'active',
    enrolledAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p
  } as Enrollment;
}
function examResult(p: Partial<ExamResult> & { id: string }): ExamResult {
  return {
    ...base,
    updatedAt: '2026-01-01T00:00:00.000Z',
    testId: 'tst1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    attemptsCount: 1,
    maxScore: 100,
    passed: true,
    ...p
  } as ExamResult;
}

const groups: GroupEntity[] = [
  {
    ...base,
    updatedAt: base.createdAt,
    id: 'g1',
    code: 'G1',
    name: 'Группа 1',
    counterpartyId: 'c1'
  },
  { ...base, updatedAt: base.createdAt, id: 'g2', code: 'G2', name: 'Группа 2' }
];
const courses: Course[] = [
  { ...base, updatedAt: base.createdAt, id: 'crs1', code: 'C1', title: 'Курс 1', isArchived: false }
];
const groupCourses: GroupCourse[] = [
  { ...base, updatedAt: base.createdAt, id: 'gc1', groupId: 'g1', courseId: 'crs1', sortOrder: 0 }
];
const tests = [{ ...base, updatedAt: base.createdAt, id: 'tst1', courseId: 'crs1' }] as never[];

describe('computeAnalyticsDashboard', () => {
  it('computes completion rate, pass rate and attempt distribution', () => {
    const enrollments = [
      enrollment({
        id: 'e1',
        status: 'completed',
        enrolledAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-11T00:00:00.000Z'
      }),
      enrollment({ id: 'e2', status: 'active' })
    ];
    const examResults = [
      examResult({ id: 'x1', enrollmentId: 'e1', attemptsCount: 1, passed: true, bestScore: 80 }),
      examResult({ id: 'x2', enrollmentId: 'e2', attemptsCount: 3, passed: false, bestScore: 40 })
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults,
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    expect(out.enrollmentsTotal).toBe(2);
    expect(out.enrollmentsCompleted).toBe(1);
    expect(out.completionRate).toBeCloseTo(0.5);
    expect(out.examResultsTotal).toBe(2);
    expect(out.examResultsPassed).toBe(1);
    expect(out.examPassRate).toBeCloseTo(0.5);
    expect(out.averageCompletionDays).toBeCloseTo(10);
    expect(out.averageScorePercent).toBeCloseTo(0.6); // (0.8 + 0.4) / 2
    expect(out.attemptDistribution).toEqual({
      passedFirstAttempt: 1,
      passedSecondAttempt: 0,
      passedThirdPlusAttempt: 0
    });
  });

  it('counts drop-off: active enrollments stale beyond threshold', () => {
    const enrollments = [
      enrollment({ id: 'e1', status: 'active', updatedAt: '2026-01-01T00:00:00.000Z' }), // stale
      enrollment({ id: 'e2', status: 'active', updatedAt: '2026-01-30T00:00:00.000Z' }), // fresh
      enrollment({ id: 'e3', status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' }) // not active
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    expect(out.dropOffCount).toBe(1);
    expect(out.dropOffThresholdDays).toBe(14);
  });

  it('filters by clientId via group.counterpartyId', () => {
    const enrollments = [
      enrollment({ id: 'e1', groupId: 'g1' }), // counterparty c1
      enrollment({ id: 'e2', groupId: 'g2' }) // no counterparty
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: { clientId: 'c1' }
    });
    expect(out.enrollmentsTotal).toBe(1);
    expect(out.scope.clientId).toBe('c1');
  });

  it('produces byCourse and byGroup breakdown rows with labels', () => {
    const enrollments = [
      enrollment({ id: 'e1', groupId: 'g1', status: 'completed' }),
      enrollment({ id: 'e2', groupId: 'g1', status: 'active' })
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    const courseRow = out.byCourse.find((r) => r.key === 'crs1');
    expect(courseRow?.label).toBe('Курс 1');
    expect(courseRow?.enrollmentsTotal).toBe(2);
    expect(courseRow?.completionRate).toBeCloseTo(0.5);
    const groupRow = out.byGroup.find((r) => r.key === 'g1');
    expect(groupRow?.label).toBe('Группа 1');
    expect(groupRow?.enrollmentsTotal).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/analytics-dashboard.test.ts --no-file-parallelism`
Expected: FAIL — `computeAnalyticsDashboard` is not exported / module not found.

- [ ] **Step 3: Implement the pure aggregator**

`apps/backend/src/modules/mvp/analytics-dashboard.ts`:

```ts
import type {
  AnalyticsBreakdownRow,
  AnalyticsDashboardDto,
  Course,
  Enrollment,
  ExamResult,
  GroupCourse,
  GroupEntity
} from './mvp.types.js';

/** Минимальная форма теста, нужная агрегатору (id → courseId). */
interface TestLike {
  id: string;
  courseId: string;
}

export interface AnalyticsInput {
  enrollments: Enrollment[];
  examResults: ExamResult[];
  groups: GroupEntity[];
  groupCourses: GroupCourse[];
  courses: Course[];
  tests: TestLike[];
  /** ISO «сейчас» для расчёта drop-off. */
  asOf: string;
  dropOffThresholdDays: number;
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
}

const MS_PER_DAY = 86_400_000;

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Доля балла от максимума для одного результата, либо null. */
function scorePercent(er: ExamResult): number | null {
  const raw = er.bestScore ?? er.finalScore;
  if (raw === undefined || !er.maxScore || er.maxScore <= 0) return null;
  return raw / er.maxScore;
}

export function computeAnalyticsDashboard(input: AnalyticsInput): AnalyticsDashboardDto {
  const { enrollments, examResults, groups, groupCourses, courses, tests, scope } = input;

  let enrolledTo = scope.enrolledTo;
  if (enrolledTo && enrolledTo.length === 10 && !enrolledTo.includes('T')) {
    enrolledTo = `${enrolledTo}T23:59:59.999Z`;
  }

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));
  const testCourseById = new Map(tests.map((t) => [t.id, t.courseId]));
  const coursesForGroup = (groupId: string): string[] =>
    groupCourses.filter((gc) => gc.groupId === groupId).map((gc) => gc.courseId);

  const enrollmentInScope = (e: Enrollment): boolean => {
    if (scope.groupId && e.groupId !== scope.groupId) return false;
    if (scope.courseId && !coursesForGroup(e.groupId).includes(scope.courseId)) return false;
    if (scope.clientId && groupById.get(e.groupId)?.counterpartyId !== scope.clientId) return false;
    if (scope.enrolledFrom && e.enrolledAt < scope.enrolledFrom) return false;
    if (enrolledTo && e.enrolledAt > enrolledTo) return false;
    return true;
  };

  const scoped = enrollments.filter(enrollmentInScope);
  const scopedIds = new Set(scoped.map((e) => e.id));

  const examInScope = (er: ExamResult): boolean => {
    if (!scopedIds.has(er.enrollmentId)) return false;
    if (scope.courseId && testCourseById.get(er.testId) !== scope.courseId) return false;
    return true;
  };
  const scopedExams = examResults.filter(examInScope);

  // Top-line metrics.
  const completed = scoped.filter((e) => e.status === 'completed');
  const completionDays = completed
    .filter((e) => e.completedAt)
    .map(
      (e) =>
        (new Date(e.completedAt as string).getTime() - new Date(e.enrolledAt).getTime()) /
        MS_PER_DAY
    );
  const passedExams = scopedExams.filter((er) => er.passed);
  const scorePercents = scopedExams.map(scorePercent).filter((v): v is number => v !== null);

  const attemptDistribution = passedExams.reduce(
    (acc, er) => {
      if (er.attemptsCount <= 1) acc.passedFirstAttempt += 1;
      else if (er.attemptsCount === 2) acc.passedSecondAttempt += 1;
      else acc.passedThirdPlusAttempt += 1;
      return acc;
    },
    { passedFirstAttempt: 0, passedSecondAttempt: 0, passedThirdPlusAttempt: 0 }
  );

  const staleThreshold = new Date(input.asOf).getTime() - input.dropOffThresholdDays * MS_PER_DAY;
  const dropOffCount = scoped.filter(
    (e) => e.status === 'active' && new Date(e.updatedAt).getTime() < staleThreshold
  ).length;

  // Breakdown helper: given an enrollment subset + exam subset, build a row.
  const buildRow = (
    key: string,
    label: string,
    rowEnrollments: Enrollment[],
    rowExams: ExamResult[]
  ): AnalyticsBreakdownRow => {
    const rowScores = rowExams.map(scorePercent).filter((v): v is number => v !== null);
    return {
      key,
      label,
      enrollmentsTotal: rowEnrollments.length,
      enrollmentsCompleted: rowEnrollments.filter((e) => e.status === 'completed').length,
      completionRate: ratio(
        rowEnrollments.filter((e) => e.status === 'completed').length,
        rowEnrollments.length
      ),
      examPassRate: ratio(rowExams.filter((er) => er.passed).length, rowExams.length),
      averageScorePercent: average(rowScores)
    };
  };

  // byCourse: every course linked to a scoped enrollment's group.
  const courseKeys = new Set<string>();
  for (const e of scoped) for (const c of coursesForGroup(e.groupId)) courseKeys.add(c);
  const byCourse = [...courseKeys]
    .map((courseId) => {
      const rowEnrollments = scoped.filter((e) => coursesForGroup(e.groupId).includes(courseId));
      const rowIds = new Set(rowEnrollments.map((e) => e.id));
      const rowExams = scopedExams.filter(
        (er) => rowIds.has(er.enrollmentId) && testCourseById.get(er.testId) === courseId
      );
      return buildRow(
        courseId,
        courseTitleById.get(courseId) ?? courseId,
        rowEnrollments,
        rowExams
      );
    })
    .sort((a, b) => b.enrollmentsTotal - a.enrollmentsTotal);

  // byGroup: scoped enrollments grouped by groupId.
  const groupKeys = [...new Set(scoped.map((e) => e.groupId))];
  const byGroup = groupKeys
    .map((groupId) => {
      const rowEnrollments = scoped.filter((e) => e.groupId === groupId);
      const rowIds = new Set(rowEnrollments.map((e) => e.id));
      const rowExams = scopedExams.filter((er) => rowIds.has(er.enrollmentId));
      return buildRow(groupId, groupById.get(groupId)?.name ?? groupId, rowEnrollments, rowExams);
    })
    .sort((a, b) => b.enrollmentsTotal - a.enrollmentsTotal);

  return {
    scope: {
      ...(scope.courseId ? { courseId: scope.courseId } : {}),
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      ...(scope.enrolledFrom ? { enrolledFrom: scope.enrolledFrom } : {}),
      ...(enrolledTo ? { enrolledTo } : {})
    },
    enrollmentsTotal: scoped.length,
    enrollmentsCompleted: completed.length,
    completionRate: ratio(completed.length, scoped.length),
    examResultsTotal: scopedExams.length,
    examResultsPassed: passedExams.length,
    examPassRate: ratio(passedExams.length, scopedExams.length),
    averageCompletionDays: average(completionDays),
    averageScorePercent: average(scorePercents),
    attemptDistribution,
    dropOffCount,
    dropOffThresholdDays: input.dropOffThresholdDays,
    byCourse,
    byGroup
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/analytics-dashboard.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/analytics-dashboard.ts apps/backend/src/modules/mvp/analytics-dashboard.test.ts
git commit -m "feat(backend): Phase 9 Plan B — pure analytics-dashboard aggregator + unit tests"
```

---

## Task 3: Service adapter + controller endpoint + permission boundary (Backend track)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add method near `getKpiSnapshot`, ~line 1498)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (after the `reports/kpi-snapshot` handler, ~line 514)
- Test: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

**Depends on:** Task 2.

- [ ] **Step 1: Add the failing HTTP integration case**

In `mvp.http.integration.test.ts`, find the existing `reports/kpi-snapshot` stub-controller permission test and add an analogous block. The stub-controller pattern in this file boots a minimal Nest app and asserts only the permission boundary. Add a handler to the stub controller mirroring the existing `kpi-snapshot` one but for `reports/analytics-dashboard` guarded by `enrollments.read`, then add:

```ts
it('GET /reports/analytics-dashboard requires enrollments.read', async () => {
  await request(app.getHttpServer())
    .get('/reports/analytics-dashboard')
    .set(headersWithPermissions([])) // no permissions
    .expect(403);

  await request(app.getHttpServer())
    .get('/reports/analytics-dashboard')
    .set(headersWithPermissions(['enrollments.read']))
    .expect(200);
});
```

> NOTE for implementer: match the exact helper names already used in this file (`headersWithPermissions` is illustrative — use whatever the existing `kpi-snapshot` test uses, e.g. a `tokenWith([...])` builder). Copy the neighbouring `kpi-snapshot` test's structure verbatim and only swap the path + permission.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: FAIL — route 404 / handler missing on the stub controller until added.

- [ ] **Step 3: Add the service adapter**

In `mvp.service.ts`, import the aggregator at the top with the other relative imports:

```ts
import { computeAnalyticsDashboard } from './analytics-dashboard.js';
```

Add `AnalyticsDashboardDto` to the type import block from `./mvp.types.js` (alongside `KpiSnapshotDto`). Then add the method directly after `getKpiSnapshot` (after line ~1498):

```ts
  getAnalyticsDashboard(tenantId: string, query: BaseFilterQuery): AnalyticsDashboardDto {
    const here = <T extends { tenantId: string }>(rows: T[]): T[] =>
      rows.filter((r) => r.tenantId === tenantId);
    return computeAnalyticsDashboard({
      enrollments: here(this.state.enrollments),
      examResults: here(this.state.examResults),
      groups: here(this.state.groups),
      groupCourses: here(this.state.groupCourses),
      courses: here(this.state.courses),
      tests: here(this.state.tests).map((t) => ({ id: t.id, courseId: t.courseId })),
      asOf: new Date().toISOString(),
      dropOffThresholdDays: 14,
      scope: {
        ...(query.course_id ? { courseId: query.course_id } : {}),
        ...(query.group_id ? { groupId: query.group_id } : {}),
        ...(query.client_id ? { clientId: query.client_id } : {}),
        ...(query.enrolled_from ?? query.created_from
          ? { enrolledFrom: query.enrolled_from ?? query.created_from }
          : {}),
        ...(query.enrolled_to ?? query.created_to
          ? { enrolledTo: query.enrolled_to ?? query.created_to }
          : {})
      }
    });
  }
```

> NOTE: verify `this.state.tests` rows expose `courseId` (they do — `getKpiSnapshot` reads `test.courseId`). If `this.state.groups`/`this.state.courses` field names differ, adjust — collection names confirmed in `infrastructure/mvp-collections.ts` (`courses`, `groups`, `tests`, `examResults`, `enrollments`, `groupCourses`).

- [ ] **Step 4: Add the controller endpoint**

In `mvp.controller.ts`, directly after the `getKpiSnapshot` handler (line ~514):

```ts
  @Get('reports/analytics-dashboard')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  getAnalyticsDashboard(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.getAnalyticsDashboard(c.tenantId!, q);
  }
```

- [ ] **Step 5: Run the HTTP integration test + the aggregator test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts src/modules/mvp/analytics-dashboard.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Typecheck backend**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): Phase 9 Plan B — GET /reports/analytics-dashboard (enrollments.read)"
```

---

## Task 4: Frontend feature module — types, api, hook, pure helpers (Frontend track)

**Files:**

- Create: `apps/frontend/src/features/analytics/types.ts`
- Create: `apps/frontend/src/features/analytics/api.ts`
- Create: `apps/frontend/src/features/analytics/hooks.ts`
- Create: `apps/frontend/src/features/analytics/format.ts`
- Test: `apps/frontend/src/features/analytics/format.test.ts`
- Test: `apps/frontend/src/features/analytics/api.contract.test.ts`

**Depends on:** Task 1 (DTO shape). **Parallel-safe with:** Tasks 2–3.

- [ ] **Step 1: Create the types**

`apps/frontend/src/features/analytics/types.ts`:

```ts
import type { BaseFilterQuery } from '../mvp/types';

export type AnalyticsFilterQuery = BaseFilterQuery & {
  course_id?: string;
  group_id?: string;
  client_id?: string;
  enrolled_from?: string;
  enrolled_to?: string;
};

export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examPassRate: number;
  averageScorePercent: number | null;
}

export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

export interface AnalyticsDashboard {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  averageCompletionDays: number | null;
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  dropOffCount: number;
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}
```

- [ ] **Step 2: Create the api client**

`apps/frontend/src/features/analytics/api.ts` — mirror `mvpApi.getKpiSnapshot` (`features/mvp/api.ts:228`):

```ts
import { apiRequest } from '../../lib/api/client';
import { queryString, withAuth } from '../mvp/api';

import type { AnalyticsDashboard, AnalyticsFilterQuery } from './types';
import type { UserSession } from '../../entities/session/model';

export const analyticsApi = {
  getDashboard: (session: UserSession, query: AnalyticsFilterQuery) =>
    apiRequest<AnalyticsDashboard>(
      `/reports/analytics-dashboard${queryString(query)}`,
      withAuth(session)
    )
};
```

> NOTE: confirm `queryString` and `withAuth` are exported from `features/mvp/api.ts`. They are used internally there; if they are not exported, either export them or inline the same helpers (the existing `getKpiSnapshot` shows the exact call shape). `UserSession` import path matches `features/mvp/api.ts`.

- [ ] **Step 3: Create the hook**

`apps/frontend/src/features/analytics/hooks.ts` — mirror `useKpiSnapshot` (`features/mvp/hooks.ts:97`), reusing the shared `useMvpQuery`:

```ts
import { useMvpQuery } from '../mvp/hooks';

import { analyticsApi } from './api';

import type { AnalyticsFilterQuery } from './types';

export const useAnalyticsDashboard = (query: AnalyticsFilterQuery) =>
  useMvpQuery('analyticsDashboard', query, (s) => analyticsApi.getDashboard(s, query));
```

> NOTE: confirm `useMvpQuery` is exported from `features/mvp/hooks.ts`. It is used throughout that file; if not exported, export it (it is the canonical query helper).

- [ ] **Step 4: Write the failing pure-helper test**

`apps/frontend/src/features/analytics/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeBarChartLayout, formatPercent, formatDays } from './format';

describe('analytics format helpers', () => {
  it('formats 0..1 ratio as percent string', () => {
    expect(formatPercent(0.5)).toBe('50.0 %');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats average days', () => {
    expect(formatDays(10)).toBe('10.0 дн.');
    expect(formatDays(null)).toBe('—');
  });

  it('lays out bars proportionally to the max value', () => {
    const layout = computeBarChartLayout(
      [
        { label: 'A', value: 10 },
        { label: 'B', value: 5 },
        { label: 'C', value: 0 }
      ],
      { width: 200, barHeight: 20, gap: 4 }
    );
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars[0].width).toBeCloseTo(200); // max → full width
    expect(layout.bars[1].width).toBeCloseTo(100); // half
    expect(layout.bars[2].width).toBe(0);
    expect(layout.height).toBe(3 * 20 + 2 * 4);
    expect(layout.bars[1].y).toBe(20 + 4);
  });

  it('handles an all-zero dataset without dividing by zero', () => {
    const layout = computeBarChartLayout([{ label: 'A', value: 0 }], {
      width: 100,
      barHeight: 10,
      gap: 2
    });
    expect(layout.bars[0].width).toBe(0);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/analytics/format.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the pure helpers**

`apps/frontend/src/features/analytics/format.ts`:

```ts
export function formatPercent(ratio: number | null): string {
  if (ratio === null || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)} %`;
}

export function formatDays(days: number | null): string {
  if (days === null || Number.isNaN(days)) return '—';
  return `${days.toFixed(1)} дн.`;
}

export interface BarInput {
  label: string;
  value: number;
}

export interface BarChartOptions {
  width: number;
  barHeight: number;
  gap: number;
}

export interface LaidOutBar {
  label: string;
  value: number;
  /** Pixel width proportional to the dataset max. */
  width: number;
  /** Top offset in px. */
  y: number;
}

export interface BarChartLayout {
  bars: LaidOutBar[];
  height: number;
}

/** Pure bar-chart geometry — no DOM, fully unit-testable (Deviation D-B1). */
export function computeBarChartLayout(data: BarInput[], opts: BarChartOptions): BarChartLayout {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const bars = data.map((d, i) => ({
    label: d.label,
    value: d.value,
    width: max === 0 ? 0 : (d.value / max) * opts.width,
    y: i * (opts.barHeight + opts.gap)
  }));
  const height =
    data.length === 0 ? 0 : data.length * opts.barHeight + (data.length - 1) * opts.gap;
  return { bars, height };
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/analytics/format.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 8: Write the api.contract test**

`apps/frontend/src/features/analytics/api.contract.test.ts` — mirror an existing `api.contract.test.ts` (stub `fetch` with `vi.stubGlobal`, assert envelope unwrap):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyticsApi } from './api';

import type { AnalyticsDashboard } from './types';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 't1', login: 'a', email: null, status: 'active', displayName: 'A' },
  tokens: { accessToken: 'tok', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['enrollments.read']
} as unknown as UserSession;

const sample: AnalyticsDashboard = {
  scope: {},
  enrollmentsTotal: 2,
  enrollmentsCompleted: 1,
  completionRate: 0.5,
  examResultsTotal: 1,
  examResultsPassed: 1,
  examPassRate: 1,
  averageCompletionDays: 10,
  averageScorePercent: 0.8,
  attemptDistribution: { passedFirstAttempt: 1, passedSecondAttempt: 0, passedThirdPlusAttempt: 0 },
  dropOffCount: 0,
  dropOffThresholdDays: 14,
  byCourse: [],
  byGroup: []
};

afterEach(() => vi.unstubAllGlobals());

describe('analyticsApi.getDashboard', () => {
  it('unwraps the API envelope and hits the right path', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: sample,
            meta: { requestId: 'r', correlationId: 'c', timestamp: 't' }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyticsApi.getDashboard(session, { course_id: 'crs1' });
    expect(result.completionRate).toBe(0.5);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/reports/analytics-dashboard');
    expect(calledUrl).toContain('course_id=crs1');
  });
});
```

> NOTE: match the exact `Response`/`fetch` stub idiom of a neighbouring `api.contract.test.ts` (e.g. `features/bulk-enrollments/api.contract.test.ts`) if it differs — the envelope shape `{ data, meta }` is the invariant to preserve.

- [ ] **Step 9: Run the contract test**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/analytics/api.contract.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/analytics/types.ts apps/frontend/src/features/analytics/api.ts apps/frontend/src/features/analytics/hooks.ts apps/frontend/src/features/analytics/format.ts apps/frontend/src/features/analytics/format.test.ts apps/frontend/src/features/analytics/api.contract.test.ts
git commit -m "feat(frontend): Phase 9 Plan B — analytics feature module (api, hook, pure helpers)"
```

---

## Task 5: Charts, screen, page, navigation + e2e (Frontend track)

**Files:**

- Create: `apps/frontend/src/features/analytics/charts.tsx`
- Create: `apps/frontend/src/features/analytics/screens.tsx`
- Create: `apps/frontend/app/admin/analytics/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Test: `apps/frontend/src/e2e/analytics-dashboard.e2e.test.ts`

**Depends on:** Task 4.

- [ ] **Step 1: Create the inline-SVG bar chart component**

`apps/frontend/src/features/analytics/charts.tsx`:

```tsx
'use client';

import { computeBarChartLayout, type BarInput } from './format';

export function BarChart({
  data,
  ariaLabel,
  width = 280,
  barHeight = 22,
  gap = 8
}: {
  data: BarInput[];
  ariaLabel: string;
  width?: number;
  barHeight?: number;
  gap?: number;
}) {
  const labelGutter = 140;
  const layout = computeBarChartLayout(data, { width, barHeight, gap });
  if (data.length === 0) {
    return <p className="ui-text-muted">Нет данных для графика</p>;
  }
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={labelGutter + width + 48}
      height={layout.height}
      style={{ maxWidth: '100%' }}
    >
      {layout.bars.map((bar) => (
        <g key={bar.label} transform={`translate(0, ${bar.y})`}>
          <text x={0} y={barHeight * 0.7} fontSize={13} fill="var(--color-text-muted)">
            {bar.label.length > 18 ? `${bar.label.slice(0, 17)}…` : bar.label}
          </text>
          <rect
            x={labelGutter}
            y={2}
            width={bar.width}
            height={barHeight - 4}
            rx={3}
            fill="var(--color-primary, #1e40af)"
          />
          <text
            x={labelGutter + bar.width + 6}
            y={barHeight * 0.7}
            fontSize={13}
            fill="var(--color-text)"
          >
            {bar.value}
          </text>
        </g>
      ))}
    </svg>
  );
}
```

> NOTE: use the actual token CSS-variable names from `packages/ui/src/tokens` / `styles/foundation.ts` if `--color-primary` / `--color-text-muted` differ. The `#1e40af` fallback is the project's readable blue (per the 2026-06-06 visual-design-system work).

- [ ] **Step 2: Create the screen**

`apps/frontend/src/features/analytics/screens.tsx`:

```tsx
'use client';

import { DataTable, FilterBar } from '@cdoprof/ui';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { BarChart } from './charts';
import { formatDays, formatPercent } from './format';
import { useAnalyticsDashboard } from './hooks';

import type { AnalyticsFilterQuery } from './types';

export function AnalyticsDashboardScreen() {
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query: AnalyticsFilterQuery = {
    ...(courseId.trim() ? { course_id: courseId.trim() } : {}),
    ...(groupId.trim() ? { group_id: groupId.trim() } : {}),
    ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
    ...(from ? { enrolled_from: from } : {}),
    ...(to ? { enrolled_to: to } : {})
  };
  const dash = useAnalyticsDashboard(query);
  const d = dash.data;

  return (
    <PageContainer>
      <PageHeader
        title="Аналитика обучения"
        subtitle="Phase 9 — завершаемость, сдача экзаменов, средний срок и балл, drop-off; drill-down по курсу/группе/компании"
      />
      <SectionCard title="Фильтр">
        <FilterBar>
          <label>
            Курс (id)
            <input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="course_id"
            />
          </label>
          <label>
            Группа (id)
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="group_id"
            />
          </label>
          <label>
            Компания (id)
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client_id"
            />
          </label>
          <label>
            С<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            По
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </FilterBar>
      </SectionCard>

      {dash.error ? (
        <SectionCard title="Ошибка">
          <p className="ui-text-muted">{dash.error}</p>
        </SectionCard>
      ) : null}
      {dash.loading ? (
        <SectionCard title="Загрузка">
          <p className="ui-text-muted">Загрузка аналитики…</p>
        </SectionCard>
      ) : null}

      {!dash.loading && !dash.error && d ? (
        <>
          <SectionCard title="Ключевые показатели">
            <dl className="ui-stack">
              <div>
                <dt>Зачислений</dt>
                <dd>
                  {d.enrollmentsTotal} (завершено {d.enrollmentsCompleted})
                </dd>
              </div>
              <div>
                <dt>Завершаемость</dt>
                <dd>{formatPercent(d.completionRate)}</dd>
              </div>
              <div>
                <dt>Сдача экзаменов</dt>
                <dd>
                  {formatPercent(d.examPassRate)} ({d.examResultsPassed}/{d.examResultsTotal})
                </dd>
              </div>
              <div>
                <dt>Средний срок прохождения</dt>
                <dd>{formatDays(d.averageCompletionDays)}</dd>
              </div>
              <div>
                <dt>Средний балл</dt>
                <dd>{formatPercent(d.averageScorePercent)}</dd>
              </div>
              <div>
                <dt>Drop-off (нет активности &gt; {d.dropOffThresholdDays} дн.)</dt>
                <dd>{d.dropOffCount}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Завершаемость по курсам">
            <BarChart
              ariaLabel="Завершённые зачисления по курсам"
              data={d.byCourse.map((r) => ({ label: r.label, value: r.enrollmentsCompleted }))}
            />
          </SectionCard>

          <SectionCard title="С какой попытки сдают экзамен">
            <BarChart
              ariaLabel="Распределение попыток до сдачи"
              data={[
                { label: 'С 1-й попытки', value: d.attemptDistribution.passedFirstAttempt },
                { label: 'Со 2-й попытки', value: d.attemptDistribution.passedSecondAttempt },
                { label: '3+ попытки', value: d.attemptDistribution.passedThirdPlusAttempt }
              ]}
            />
          </SectionCard>

          <SectionCard title="Разбивка по курсам">
            <DataTable
              columns={[
                { key: 'label', title: 'Курс' },
                { key: 'enrollmentsTotal', title: 'Зачислений' },
                { key: 'enrollmentsCompleted', title: 'Завершено' },
                { key: 'completionRateText', title: 'Завершаемость' },
                { key: 'examPassRateText', title: 'Сдача' },
                { key: 'avgScoreText', title: 'Средний балл' }
              ]}
              rows={d.byCourse.map((r) => ({
                ...r,
                completionRateText: formatPercent(r.completionRate),
                examPassRateText: formatPercent(r.examPassRate),
                avgScoreText: formatPercent(r.averageScorePercent)
              }))}
            />
          </SectionCard>

          <SectionCard title="Разбивка по группам">
            <DataTable
              columns={[
                { key: 'label', title: 'Группа' },
                { key: 'enrollmentsTotal', title: 'Зачислений' },
                { key: 'enrollmentsCompleted', title: 'Завершено' },
                { key: 'completionRateText', title: 'Завершаемость' },
                { key: 'examPassRateText', title: 'Сдача' },
                { key: 'avgScoreText', title: 'Средний балл' }
              ]}
              rows={d.byGroup.map((r) => ({
                ...r,
                completionRateText: formatPercent(r.completionRate),
                examPassRateText: formatPercent(r.examPassRate),
                avgScoreText: formatPercent(r.averageScorePercent)
              }))}
            />
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
}
```

> NOTE: confirm `PageContainer`/`PageHeader`/`SectionCard` import path (`../../components/state-wrappers`) — `app/reports/page.tsx` imports them from `../../src/components/state-wrappers`; from `src/features/analytics/` the relative path is `../../components/state-wrappers`. Confirm `dash.loading`/`dash.error`/`dash.data` field names match `useMvpQuery`'s return shape (they do — `app/reports/page.tsx` uses `kpi.loading`/`kpi.error`/`kpi.data`).

- [ ] **Step 3: Create the route shell**

`apps/frontend/app/admin/analytics/page.tsx`:

```tsx
import { AnalyticsDashboardScreen } from '../../../src/features/analytics/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AnalyticsPage() {
  return (
    <ProtectedPage>
      <AnalyticsDashboardScreen />
    </ProtectedPage>
  );
}
```

- [ ] **Step 4: Register navigation (routeMeta + nav entry)**

In `apps/frontend/src/features/navigation/model.ts`:

Add to the `routeMeta` array (near the other `/admin/*` patterns, e.g. after line ~37):

```ts
  { pattern: '/admin/analytics', meta: { public: false, requiredPermissions: ['enrollments.read'] } },
```

Add to the `navigationModel` array (near `/reports`, after line ~231):

```ts
  { href: '/admin/analytics', label: 'Аналитика', requiredPermissions: ['enrollments.read'] },
```

> NOTE: match the exact object shapes in this file (the snippets above mirror lines 35 and 231). If `routeMeta` matches by prefix and `/admin/analytics` would be shadowed by a broader `/admin` entry, place it so the more specific pattern is evaluated — check `features/navigation/helpers.ts` `evaluateRouteAccess` matching order.

- [ ] **Step 5: Write the e2e smoke test**

`apps/frontend/src/e2e/analytics-dashboard.e2e.test.ts`:

```ts
/**
 * Phase 9 Plan B — E2E smoke для админ-дашборда аналитики.
 * Конвенция проекта: routing/permission через evaluateRouteAccess + getVisibleNavigation,
 * pure-helper integration, dynamic-import smoke экрана. Реального React mount нет (RTL не в deps).
 */
import { describe, expect, it } from 'vitest';

import { computeBarChartLayout, formatPercent } from '../features/analytics/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const admin: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 't1',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['enrollments.read']
};
const noPerms: UserSession = { ...admin, permissions: [] };

describe('analytics dashboard E2E smoke', () => {
  it('route /admin/analytics requires enrollments.read', () => {
    expect(evaluateRouteAccess('/admin/analytics', admin)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/analytics', noPerms)).toEqual({ kind: 'forbidden' });
    expect(evaluateRouteAccess('/admin/analytics', null)).toEqual({ kind: 'redirect-login' });
  });

  it('nav «Аналитика» visible only with enrollments.read', () => {
    expect(getVisibleNavigation(admin).map((i) => i.href)).toContain('/admin/analytics');
    expect(getVisibleNavigation(noPerms).map((i) => i.href)).not.toContain('/admin/analytics');
  });

  it('pure helpers integrate', () => {
    expect(formatPercent(0.5)).toBe('50.0 %');
    expect(
      computeBarChartLayout([{ label: 'A', value: 1 }], { width: 10, barHeight: 4, gap: 1 }).bars[0]
        .width
    ).toBe(10);
  });

  it('screen module imports without crashing', async () => {
    const mod = await import('../features/analytics/screens');
    expect(typeof mod.AnalyticsDashboardScreen).toBe('function');
  });
});
```

> NOTE: match the exact `evaluateRouteAccess` return shape used by sibling e2e tests (`{ kind: 'ok' | 'forbidden' | 'redirect-login' }` — confirm against `admin-bulk-enrollment.e2e.test.ts`).

- [ ] **Step 6: Run frontend targeted tests**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/analytics src/e2e/analytics-dashboard.e2e.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint frontend**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit` then `npx eslint apps/frontend/src/features/analytics apps/frontend/app/admin/analytics/page.tsx --max-warnings=0`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/analytics/charts.tsx apps/frontend/src/features/analytics/screens.tsx apps/frontend/app/admin/analytics/page.tsx apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/analytics-dashboard.e2e.test.ts
git commit -m "feat(frontend): Phase 9 Plan B — /admin/analytics dashboard (SVG charts, drill-down tables, nav, e2e)"
```

---

## Task 6: Integration verification + docs

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.120)

**Depends on:** Tasks 3 and 5 (both tracks merged).

- [ ] **Step 1: Backend cluster + typecheck**

Run:

```
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/analytics-dashboard.test.ts src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
pnpm typecheck
```

Expected: PASS (typecheck 8/8 tasks).

- [ ] **Step 2: Frontend targeted suite**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/analytics src/e2e/analytics-dashboard.e2e.test.ts --no-file-parallelism`
Expected: PASS. (Full `pnpm test:frontend` may show the known ~6 environmental dynamic-import failures — compare against baseline; the analytics files must be green in isolation.)

- [ ] **Step 3: Lint changed files**

Run: `npx eslint apps/frontend/src/features/analytics apps/backend/src/modules/mvp/analytics-dashboard.ts --max-warnings=0`
Expected: PASS.

- [ ] **Step 4: Update handoff docs**

- README §2: set Current Task = "Phase 9 Plan B — analytics dashboard готова на ветке `feat/2026-06-13-phase-9-plan-b-analytics`, ожидает PR"; Last Completed Task summary; Next Task = "PR Plan B → merge; затем Phase 10 (PWA/WCAG/Excel)".
- LMS_AGENT_HANDOFF.md: append `### 5.120` with summary, files changed, test status, Deviation D-B1 (recharts → inline SVG), cross-link this plan.
- Tick the checkboxes in this plan file.

- [ ] **Step 5: Commit docs**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-13-phase-9-plan-b-analytics-dashboard.md
git commit -m "docs: Phase 9 Plan B handoff §5.120 + plan checkboxes"
```

- [ ] **Step 6: Push + open PR**

```bash
git push -u origin feat/2026-06-13-phase-9-plan-b-analytics
gh pr create --title "Phase 9 Plan B: admin analytics dashboard" --body "<Summary + Test plan>"
```

---

## Self-Review notes

- **Spec §11 coverage:** completion rate ✓ (Task 2), exam pass rate ✓, avg completion time ✓ (`averageCompletionDays`), avg score ✓ (`averageScorePercent`), attempt distribution 1/2/3+ ✓, drop-off >14d ✓, by-course/by-group breakdown rows ✓, filters course/group/client/date ✓, `enrollments.read` permission ✓, `/admin/analytics` page + nav ✓, charts ✓ (inline SVG per D-B1), kpi-snapshot untouched ✓.
- **No new migration / permission / collection** — read-model only, matches kpi-snapshot precedent.
- **Type consistency:** `AnalyticsDashboardDto` (backend) ≡ `AnalyticsDashboard` (frontend) field-by-field; `computeBarChartLayout`/`formatPercent`/`formatDays` names identical across Task 4 (impl) and Task 5 (consumers + e2e).
- **Out of scope (echoed from spec):** SCORM-result analytics, regulatory-export analytics, modal drill-downs (drill-down = filter selection), recharts.
