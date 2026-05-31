# Learner Home with "Следующий шаг" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the learner's home page (§4.2 of the V1 spec) — a single landing screen with a "Следующий шаг" card that tells the learner what to do _right now_ across all their enrollments, a list of their courses with progress bars, and a role switcher for users who also hold teacher / admin roles.

**Architecture:** Frontend-only assembly. The dashboard composes existing REST endpoints (`/enrollments?learner_id=…`, `/courses/:id`, `/progress?course_id=…`) and one pure picker function that ranks "next step" candidates. No new backend endpoints — fits MVP scale. The picker is a pure function so unit-tests cover the priority rules without React.

The current root route `/` is a generic widget grid (`apps/frontend/app/page.tsx`). For users with the `learner` role, we redirect to a new `/learner` route with this new home; other roles keep their current view unchanged.

**Tech Stack:** Next.js App Router (server component `page.tsx` wrapping a `'use client'` screen), TanStack React Query (`useQuery` / `useQueries`), Vitest. Reuses existing `mvpApi` client, `useAuth()`, `PageContainer` / `SectionCard` / `LoadingState` from `@cdoprof/ui`.

**Спецификация:** [../specs/2026-05-21-cdoprof-redesign-design.md](../specs/2026-05-21-cdoprof-redesign-design.md) §4.2

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) Phase 1

---

## File Structure

### Create

- `apps/frontend/src/features/learner-home/types.ts` — types (`NextStepCandidate`, `MyCourseSummary`, `RoleOption`, `LearnerHomeData`)
- `apps/frontend/src/features/learner-home/next-step.ts` — pure `pickNextStep(input): NextStep | null` and `formatNextStepCta(step): string`
- `apps/frontend/src/features/learner-home/next-step.test.ts` — unit tests
- `apps/frontend/src/features/learner-home/role-switcher.ts` — pure `getAvailableRoles(session): RoleOption[]` and `getActiveRole(session, requested): RoleOption['code']`
- `apps/frontend/src/features/learner-home/role-switcher.test.ts` — unit tests
- `apps/frontend/src/features/learner-home/use-learner-home-data.ts` — React Query composed hook (`useMyEnrollments` + `useQueries` for per-enrollment course/progress)
- `apps/frontend/src/features/learner-home/use-learner-home-data.test.ts` — unit test (mock mvpApi)
- `apps/frontend/src/features/learner-home/next-step-card.tsx` — presentation component for the "Следующий шаг" card
- `apps/frontend/src/features/learner-home/my-courses-list.tsx` — presentation component for the courses list with progress bars
- `apps/frontend/src/features/learner-home/role-switcher-tabs.tsx` — top-of-page tabs (component; pure logic lives in `role-switcher.ts`)
- `apps/frontend/src/features/learner-home/learner-home-screen.tsx` — the assembled screen
- `apps/frontend/app/learner/page.tsx` — Next.js route file

### Modify

- `apps/frontend/app/page.tsx` — early return: if session has `learner` role (and not currently routed elsewhere via `?as=…`), redirect to `/learner`

### Untouched

- `app/learner/courses/page.tsx` and `app/learner/courses/[id]/page.tsx` — already exist, keep behavior. The new home will link to them.

---

## Task 1: Types

**Files:**

- Create: `apps/frontend/src/features/learner-home/types.ts`

- [x] **Step 1: Define the types module**

```typescript
// apps/frontend/src/features/learner-home/types.ts
import type { Course, Enrollment, Progress } from '../mvp/types';

export interface EnrollmentWithDetails {
  enrollment: Enrollment;
  course: Course | null;
  progress: Progress[];
}

export interface MyCourseSummary {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  status: Enrollment['status'];
  progressPercent: number;
  enrolledAt: string;
}

export type NextStepKind = 'continue' | 'start' | 'completed_all' | 'awaiting_assignment';

export interface NextStep {
  kind: NextStepKind;
  courseId?: string;
  courseTitle?: string;
  moduleId?: string;
  materialId?: string;
  /** Where the user should click to act on this step. */
  href: string;
  /** Localized CTA shown on the card button. */
  cta: string;
  /** Localized headline shown above the CTA. */
  headline: string;
  /** Optional supporting text. */
  description?: string;
}

export type LearnerRoleCode = 'learner' | 'teacher' | 'tenant_admin' | 'platform_admin';

export interface RoleOption {
  code: LearnerRoleCode;
  label: string;
  href: string;
}
```

- [x] **Step 2: Commit**

```bash
git add apps/frontend/src/features/learner-home/types.ts
git commit -m "feat(frontend): add types for learner-home feature"
```

---

## Task 2: Pure `pickNextStep` function with tests

**Files:**

- Create: `apps/frontend/src/features/learner-home/next-step.test.ts`
- Create: `apps/frontend/src/features/learner-home/next-step.ts`

### Priority rules (V1)

Pick the highest-priority candidate from the user's enrollments, in this order:

1. **`continue`** — There is an enrollment with `status === 'active'` AND its `progress` array contains at least one item with `status === 'in_progress'`. Pick the **first** such (enrollments are returned in insertion order from the API). The next step targets that course; CTA = "Продолжить".
2. **`start`** — There is an enrollment with `status === 'active'` AND no in-progress progress items (either empty progress or all `not_started`). Pick the first such enrollment. CTA = "Начать обучение".
3. **`awaiting_assignment`** — There is an enrollment with `status === 'pending'` or `status === 'suspended'`. CTA = "Открыть курс" (course detail page still renders, even if not started).
4. **`completed_all`** — Every enrollment has `status === 'completed'`. Headline = "Все курсы завершены — отлично!"; CTA links to `/learner/courses` (where certificates are listed).
5. **`null`** — No enrollments at all. The card renders an empty-state instead.

`href` always points to `/learner/courses/{courseId}` for kinds 1–3; for `completed_all`, `/learner/courses`.

- [x] **Step 1: Write failing tests**

```typescript
// apps/frontend/src/features/learner-home/next-step.test.ts
import { describe, expect, it } from 'vitest';

import { pickNextStep } from './next-step';

import type { EnrollmentWithDetails } from './types';
import type { Course, Enrollment, Progress } from '../mvp/types';

const baseEntity = {
  tenantId: 't1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const buildEnrollment = (
  overrides: Partial<Enrollment> & { id: string; status: Enrollment['status']; courseId?: string }
): Enrollment => ({
  ...baseEntity,
  groupId: 'g1',
  learnerId: 'L1',
  status: 'active',
  enrolledAt: '2026-05-01T00:00:00.000Z',
  ...overrides
});

const buildCourse = (id: string, title: string): Course => ({
  ...baseEntity,
  id,
  status: 'published',
  code: id,
  title,
  isArchived: false
});

const buildProgress = (
  overrides: Partial<Progress> & {
    id: string;
    status: Progress['status'];
    moduleId: string;
    materialId: string;
  }
): Progress => ({
  ...baseEntity,
  enrollmentId: 'e1',
  courseId: 'c1',
  progressPercent:
    overrides.status === 'completed' ? 100 : overrides.status === 'in_progress' ? 50 : 0,
  ...overrides
});

describe('pickNextStep', () => {
  it('returns null when there are no enrollments', () => {
    expect(pickNextStep([])).toBeNull();
  });

  it('picks continue when an active enrollment has an in-progress material', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'Охрана труда'),
        progress: [
          buildProgress({ id: 'p1', status: 'completed', moduleId: 'm1', materialId: 'mat1' }),
          buildProgress({ id: 'p2', status: 'in_progress', moduleId: 'm1', materialId: 'mat2' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseId).toBe('c1');
    expect(step?.courseTitle).toBe('Охрана труда');
    expect(step?.moduleId).toBe('m1');
    expect(step?.materialId).toBe('mat2');
    expect(step?.href).toBe('/learner/courses/c1');
    expect(step?.cta).toBe('Продолжить');
  });

  it('prefers continue over start when both exist', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'New course'),
        progress: []
      },
      {
        enrollment: buildEnrollment({ id: 'e2', status: 'active', courseId: 'c2' }),
        course: buildCourse('c2', 'Ongoing course'),
        progress: [
          buildProgress({ id: 'p1', status: 'in_progress', moduleId: 'm1', materialId: 'mat1' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseId).toBe('c2');
  });

  it('returns start when active enrollment has no in-progress material', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'Пожарная безопасность'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('start');
    expect(step?.courseId).toBe('c1');
    expect(step?.cta).toBe('Начать обучение');
    expect(step?.href).toBe('/learner/courses/c1');
  });

  it('returns awaiting_assignment for a pending enrollment', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'pending', courseId: 'c1' }),
        course: buildCourse('c1', 'Электробезопасность'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('awaiting_assignment');
  });

  it('returns completed_all when every enrollment is completed', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'completed', courseId: 'c1' }),
        course: buildCourse('c1', 'Done 1'),
        progress: []
      },
      {
        enrollment: buildEnrollment({ id: 'e2', status: 'completed', courseId: 'c2' }),
        course: buildCourse('c2', 'Done 2'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('completed_all');
    expect(step?.href).toBe('/learner/courses');
  });

  it('falls back to course title placeholder when course detail is missing', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: null,
        progress: [
          buildProgress({ id: 'p1', status: 'in_progress', moduleId: 'm1', materialId: 'mat1' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseTitle).toBe('Курс c1');
  });

  it('ignores enrollments without a courseId', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active' }),
        course: null,
        progress: []
      }
    ];
    expect(pickNextStep(input)).toBeNull();
  });
});
```

- [x] **Step 2: Run tests, expect failure (module not implemented)**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/next-step.test.ts`
Expected: FAIL — `Cannot find module './next-step'`

- [x] **Step 3: Implement `pickNextStep`**

```typescript
// apps/frontend/src/features/learner-home/next-step.ts
import type { EnrollmentWithDetails, NextStep } from './types';

const titleFor = (entry: EnrollmentWithDetails): string =>
  entry.course?.title ?? `Курс ${entry.enrollment.courseId}`;

const hasCourseId = (
  entry: EnrollmentWithDetails
): entry is EnrollmentWithDetails & { enrollment: { courseId: string } } =>
  typeof entry.enrollment.courseId === 'string' && entry.enrollment.courseId.length > 0;

export const pickNextStep = (entries: EnrollmentWithDetails[]): NextStep | null => {
  const eligible = entries.filter(hasCourseId);
  if (eligible.length === 0) return null;

  const continueCandidate = eligible.find(
    (entry) =>
      entry.enrollment.status === 'active' &&
      entry.progress.some((step) => step.status === 'in_progress')
  );
  if (continueCandidate) {
    const inProgress = continueCandidate.progress.find((step) => step.status === 'in_progress')!;
    return {
      kind: 'continue',
      courseId: continueCandidate.enrollment.courseId,
      courseTitle: titleFor(continueCandidate),
      moduleId: inProgress.moduleId,
      materialId: inProgress.materialId,
      href: `/learner/courses/${continueCandidate.enrollment.courseId}`,
      cta: 'Продолжить',
      headline: `Продолжите «${titleFor(continueCandidate)}»`,
      description: `Возобновите материал ${inProgress.materialId} в модуле ${inProgress.moduleId}.`
    };
  }

  const startCandidate = eligible.find(
    (entry) =>
      entry.enrollment.status === 'active' &&
      !entry.progress.some((step) => step.status === 'in_progress')
  );
  if (startCandidate) {
    return {
      kind: 'start',
      courseId: startCandidate.enrollment.courseId,
      courseTitle: titleFor(startCandidate),
      href: `/learner/courses/${startCandidate.enrollment.courseId}`,
      cta: 'Начать обучение',
      headline: `Начните «${titleFor(startCandidate)}»`,
      description: 'Курс назначен и доступен. Откройте, чтобы пройти первый материал.'
    };
  }

  const pendingCandidate = eligible.find(
    (entry) => entry.enrollment.status === 'pending' || entry.enrollment.status === 'suspended'
  );
  if (pendingCandidate) {
    return {
      kind: 'awaiting_assignment',
      courseId: pendingCandidate.enrollment.courseId,
      courseTitle: titleFor(pendingCandidate),
      href: `/learner/courses/${pendingCandidate.enrollment.courseId}`,
      cta: 'Открыть курс',
      headline: `Назначение «${titleFor(pendingCandidate)}» ожидает старта`,
      description: 'Куратор подтвердит доступ. Откройте курс — там появится подробная инструкция.'
    };
  }

  if (eligible.every((entry) => entry.enrollment.status === 'completed')) {
    return {
      kind: 'completed_all',
      href: '/learner/courses',
      cta: 'Открыть мои курсы',
      headline: 'Все курсы завершены — отлично!',
      description: 'Документы доступны в разделе «Мои курсы».'
    };
  }

  return null;
};
```

- [x] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/next-step.test.ts`
Expected: 7 PASS.

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/learner-home/next-step.ts \
        apps/frontend/src/features/learner-home/next-step.test.ts
git commit -m "feat(frontend): add pure pickNextStep picker for learner home"
```

---

## Task 3: Pure role-switcher logic with tests

**Files:**

- Create: `apps/frontend/src/features/learner-home/role-switcher.test.ts`
- Create: `apps/frontend/src/features/learner-home/role-switcher.ts`

### Behavior

- `getAvailableRoles(session)` returns a `RoleOption[]` deduplicated and ordered: learner first, then teacher, tenant_admin, platform_admin. Role codes are normalized (`student` → `learner`, `admin` → `tenant_admin`) to match the rest of the frontend.
- Each role has a fixed destination href:
  - `learner` → `/learner`
  - `teacher` → `/teacher/grading-center`
  - `tenant_admin` → `/admin/cockpit`
  - `platform_admin` → `/admin/cockpit`
- If the session has only one role (or none), `getAvailableRoles` returns an empty array (caller will skip rendering the switcher).
- `getActiveRole(session, requested)` returns the role code matching the `requested` value if it's in the user's available roles; otherwise the first available role; otherwise `'learner'`.

- [x] **Step 1: Write failing tests**

```typescript
// apps/frontend/src/features/learner-home/role-switcher.test.ts
import { describe, expect, it } from 'vitest';

import { getActiveRole, getAvailableRoles } from './role-switcher';

import type { UserSession } from '../../entities/session/model';

const buildSession = (roles: string[]): UserSession => ({
  user: { id: 'u1', tenantId: 't1', login: 'u', email: null, displayName: 'U', status: 'active' },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 100 },
  roles,
  permissions: []
});

describe('getAvailableRoles', () => {
  it('returns empty array for null session', () => {
    expect(getAvailableRoles(null)).toEqual([]);
  });

  it('returns empty array when user has only one role', () => {
    expect(getAvailableRoles(buildSession(['learner']))).toEqual([]);
  });

  it('normalizes student → learner and admin → tenant_admin', () => {
    const options = getAvailableRoles(buildSession(['student', 'admin']));
    expect(options.map((o) => o.code)).toEqual(['learner', 'tenant_admin']);
  });

  it('orders learner first, then teacher, admin, platform_admin', () => {
    const options = getAvailableRoles(buildSession(['platform_admin', 'teacher', 'learner']));
    expect(options.map((o) => o.code)).toEqual(['learner', 'teacher', 'platform_admin']);
  });

  it('deduplicates roles after normalization', () => {
    const options = getAvailableRoles(buildSession(['student', 'learner']));
    expect(options).toEqual([]);
  });

  it('maps each role to its dashboard href', () => {
    const options = getAvailableRoles(buildSession(['learner', 'teacher', 'tenant_admin']));
    expect(options.find((o) => o.code === 'learner')?.href).toBe('/learner');
    expect(options.find((o) => o.code === 'teacher')?.href).toBe('/teacher/grading-center');
    expect(options.find((o) => o.code === 'tenant_admin')?.href).toBe('/admin/cockpit');
  });
});

describe('getActiveRole', () => {
  it('returns the requested role if it is available', () => {
    expect(getActiveRole(buildSession(['learner', 'teacher']), 'teacher')).toBe('teacher');
  });

  it('falls back to the first available role when requested is not available', () => {
    expect(getActiveRole(buildSession(['learner', 'teacher']), 'platform_admin')).toBe('learner');
  });

  it('returns learner as final fallback when no roles are available', () => {
    expect(getActiveRole(null, null)).toBe('learner');
  });
});
```

- [x] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/role-switcher.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `role-switcher.ts`**

```typescript
// apps/frontend/src/features/learner-home/role-switcher.ts
import type { UserSession } from '../../entities/session/model';
import type { LearnerRoleCode, RoleOption } from './types';

const ROLE_ORDER: LearnerRoleCode[] = ['learner', 'teacher', 'tenant_admin', 'platform_admin'];

const ROLE_HREF: Record<LearnerRoleCode, string> = {
  learner: '/learner',
  teacher: '/teacher/grading-center',
  tenant_admin: '/admin/cockpit',
  platform_admin: '/admin/cockpit'
};

const ROLE_LABEL: Record<LearnerRoleCode, string> = {
  learner: 'Кабинет ученика',
  teacher: 'Кабинет преподавателя',
  tenant_admin: 'Кабинет администратора',
  platform_admin: 'Кабинет платформы'
};

const normalize = (raw: string): LearnerRoleCode | null => {
  const lowered = raw.toLowerCase();
  if (lowered === 'student' || lowered === 'learner') return 'learner';
  if (lowered === 'teacher') return 'teacher';
  if (lowered === 'admin' || lowered === 'tenant_admin') return 'tenant_admin';
  if (lowered === 'platform_admin') return 'platform_admin';
  return null;
};

const collectRoles = (session: UserSession | null): LearnerRoleCode[] => {
  if (!session) return [];
  const normalized = new Set<LearnerRoleCode>();
  for (const raw of session.roles ?? []) {
    const code = normalize(raw);
    if (code) normalized.add(code);
  }
  return ROLE_ORDER.filter((code) => normalized.has(code));
};

export const getAvailableRoles = (session: UserSession | null): RoleOption[] => {
  const roles = collectRoles(session);
  if (roles.length <= 1) return [];
  return roles.map((code) => ({ code, label: ROLE_LABEL[code], href: ROLE_HREF[code] }));
};

export const getActiveRole = (
  session: UserSession | null,
  requested: string | null | undefined
): LearnerRoleCode => {
  const available = collectRoles(session);
  const normalizedRequested = requested ? normalize(requested) : null;
  if (normalizedRequested && available.includes(normalizedRequested)) {
    return normalizedRequested;
  }
  return available[0] ?? 'learner';
};
```

- [x] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/role-switcher.test.ts`
Expected: 9 PASS.

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/learner-home/role-switcher.ts \
        apps/frontend/src/features/learner-home/role-switcher.test.ts \
        apps/frontend/src/features/learner-home/types.ts
git commit -m "feat(frontend): add role switcher logic for learner home"
```

---

## Task 4: Composed data hook `useLearnerHomeData`

**Files:**

- Create: `apps/frontend/src/features/learner-home/use-learner-home-data.test.ts`
- Create: `apps/frontend/src/features/learner-home/use-learner-home-data.ts`

### What it does

`useLearnerHomeData()` returns `{ data, isLoading, error }` where `data` is `EnrollmentWithDetails[]`. Composition:

1. Read `learnerId` from `useAuth().session?.user.id`.
2. Call `mvpApi.listEnrollments(session, { learner_id, page: 1, page_size: 50 })` via React Query.
3. For each enrollment with a `courseId`, fire two parallel queries: `mvpApi.getCourse(session, courseId)` and `mvpApi.listProgress(session, { course_id: courseId })`. Use `useQueries` so they run in parallel and share the query cache.
4. Combine into `EnrollmentWithDetails[]`. `course` is `null` if its fetch failed (do not throw — degraded UI is fine).

### Why test it

We don't have a jsdom test environment, so we can't test the React lifecycle directly. But we _can_ extract a pure `assembleHomeData` function that takes the raw query results and assembles the array — that part is unit-testable.

- [x] **Step 1: Write failing test for the pure assembler**

```typescript
// apps/frontend/src/features/learner-home/use-learner-home-data.test.ts
import { describe, expect, it } from 'vitest';

import { assembleHomeData } from './use-learner-home-data';

import type { Course, Enrollment, Progress } from '../mvp/types';

const baseEntity = {
  tenantId: 't1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const enroll = (id: string, courseId?: string): Enrollment => ({
  ...baseEntity,
  id,
  status: 'active',
  groupId: 'g1',
  learnerId: 'L1',
  enrolledAt: '2026-05-01T00:00:00.000Z',
  ...(courseId ? { courseId } : {})
});

const course = (id: string): Course => ({
  ...baseEntity,
  id,
  status: 'published',
  code: id,
  title: `Course ${id}`,
  isArchived: false
});

const progress = (id: string, enrollmentId: string, courseId: string): Progress => ({
  ...baseEntity,
  id,
  enrollmentId,
  courseId,
  moduleId: 'm1',
  materialId: 'mat1',
  progressPercent: 50,
  status: 'in_progress'
});

describe('assembleHomeData', () => {
  it('joins enrollments with course detail and progress, indexed by courseId', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1', 'c1'), enroll('e2', 'c2')],
      coursesByCourseId: { c1: course('c1'), c2: course('c2') },
      progressByCourseId: {
        c1: [progress('p1', 'e1', 'c1')],
        c2: []
      }
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.enrollment.id).toBe('e1');
    expect(result[0]?.course?.title).toBe('Course c1');
    expect(result[0]?.progress).toHaveLength(1);
    expect(result[1]?.progress).toEqual([]);
  });

  it('returns null course when not available, keeping enrollment in the list', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1', 'c1')],
      coursesByCourseId: {},
      progressByCourseId: { c1: [] }
    });
    expect(result[0]?.course).toBeNull();
  });

  it('preserves enrollments without a courseId with empty progress and null course', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1')],
      coursesByCourseId: {},
      progressByCourseId: {}
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.progress).toEqual([]);
    expect(result[0]?.course).toBeNull();
  });
});
```

- [x] **Step 2: Run test, expect failure**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/use-learner-home-data.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `use-learner-home-data.ts`**

```typescript
// apps/frontend/src/features/learner-home/use-learner-home-data.ts
'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import { mvpApi } from '../mvp/api';
import { useAuth } from '../auth/context';

import type { EnrollmentWithDetails } from './types';
import type { Course, Enrollment, ListResponse, Progress } from '../mvp/types';

export interface AssembleInput {
  enrollments: Enrollment[];
  coursesByCourseId: Record<string, Course | null>;
  progressByCourseId: Record<string, Progress[]>;
}

export const assembleHomeData = (input: AssembleInput): EnrollmentWithDetails[] =>
  input.enrollments.map((enrollment) => {
    const courseId = enrollment.courseId;
    const course = courseId ? (input.coursesByCourseId[courseId] ?? null) : null;
    const progress = courseId ? (input.progressByCourseId[courseId] ?? []) : [];
    return { enrollment, course, progress };
  });

export const useLearnerHomeData = () => {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? '';

  const enrollmentsQuery = useQuery({
    queryKey: ['mvp', 'learnerHomeEnrollments', learnerId],
    enabled: Boolean(session) && learnerId.length > 0,
    queryFn: () =>
      mvpApi.listEnrollments(session!, { learner_id: learnerId, page: 1, page_size: 50 })
  });

  const enrollments = (enrollmentsQuery.data as ListResponse<Enrollment> | undefined)?.items ?? [];
  const courseIds = Array.from(
    new Set(enrollments.map((e) => e.courseId).filter((id): id is string => Boolean(id)))
  );

  const courseQueries = useQueries({
    queries: courseIds.map((courseId) => ({
      queryKey: ['mvp', 'learnerHomeCourse', courseId],
      enabled: Boolean(session),
      queryFn: () => mvpApi.getCourse(session!, courseId)
    }))
  });

  const progressQueries = useQueries({
    queries: courseIds.map((courseId) => ({
      queryKey: ['mvp', 'learnerHomeProgress', courseId],
      enabled: Boolean(session),
      queryFn: () => mvpApi.listProgress(session!, { course_id: courseId })
    }))
  });

  const coursesByCourseId: Record<string, Course | null> = {};
  courseIds.forEach((courseId, index) => {
    const result = courseQueries[index];
    coursesByCourseId[courseId] = (result?.data as Course | undefined) ?? null;
  });

  const progressByCourseId: Record<string, Progress[]> = {};
  courseIds.forEach((courseId, index) => {
    const result = progressQueries[index];
    const items = (result?.data as ListResponse<Progress> | undefined)?.items ?? [];
    progressByCourseId[courseId] = items;
  });

  const data = assembleHomeData({ enrollments, coursesByCourseId, progressByCourseId });

  const isLoading =
    enrollmentsQuery.isLoading ||
    courseQueries.some((q) => q.isLoading) ||
    progressQueries.some((q) => q.isLoading);

  const error = enrollmentsQuery.error instanceof Error ? enrollmentsQuery.error.message : null;

  return { data, isLoading, error };
};
```

- [x] **Step 4: Run test, expect pass**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-home/use-learner-home-data.test.ts`
Expected: 3 PASS.

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/learner-home/use-learner-home-data.ts \
        apps/frontend/src/features/learner-home/use-learner-home-data.test.ts
git commit -m "feat(frontend): add useLearnerHomeData composing enrollments + courses + progress"
```

---

## Task 5: `NextStepCard` component

**Files:**

- Create: `apps/frontend/src/features/learner-home/next-step-card.tsx`

- [x] **Step 1: Implement the component**

```tsx
// apps/frontend/src/features/learner-home/next-step-card.tsx
'use client';

import Link from 'next/link';

import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

import type { NextStep } from './types';

interface Props {
  step: NextStep | null;
  loading: boolean;
}

export const NextStepCard = ({ step, loading }: Props) => {
  if (loading) {
    return (
      <SectionCard title="Следующий шаг">
        <p className="ui-text-muted">Подбираем, что вам сейчас открыть…</p>
      </SectionCard>
    );
  }

  if (!step) {
    return (
      <SectionCard title="Следующий шаг">
        <SectionEmpty
          message="Пока нет назначенных курсов"
          hint="Обратитесь к куратору учебного центра — он назначит вам обучение."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Следующий шаг">
      <div className="ui-stack" style={{ gap: 12 }}>
        <div>
          <h3 className="ui-page-title" style={{ margin: 0 }}>
            {step.headline}
          </h3>
          {step.description ? <p className="ui-text-muted">{step.description}</p> : null}
        </div>
        <Link href={step.href} className="ui-button ui-button--primary" data-testid="next-step-cta">
          {step.cta}
        </Link>
      </div>
    </SectionCard>
  );
};
```

- [x] **Step 2: Commit**

```bash
git add apps/frontend/src/features/learner-home/next-step-card.tsx
git commit -m "feat(frontend): add NextStepCard presentation component"
```

---

## Task 6: `MyCoursesList` component

**Files:**

- Create: `apps/frontend/src/features/learner-home/my-courses-list.tsx`

### Behavior

- Renders a `SectionCard` titled "Мои курсы".
- For each entry, shows a row with: course title (or fallback `Курс {id}`), status chip, progress percent and a `<progress>` bar, a Link to `/learner/courses/{courseId}`.
- Computes progress percent as the average of `progress[].progressPercent` for the enrollment's course, rounded; if no progress entries, shows `0%`.
- Loading state: shows skeleton-like placeholder via existing `ListSkeleton` pattern (inlined to avoid coupling).
- Empty state: "Курсы пока не назначены" via `SectionEmpty`.

- [x] **Step 1: Implement the component**

```tsx
// apps/frontend/src/features/learner-home/my-courses-list.tsx
'use client';

import { StatusChip } from '@cdoprof/ui';
import Link from 'next/link';

import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

import type { EnrollmentWithDetails } from './types';

interface Props {
  entries: EnrollmentWithDetails[];
  loading: boolean;
}

const computeProgress = (entry: EnrollmentWithDetails): number => {
  if (entry.progress.length === 0) return 0;
  const sum = entry.progress.reduce((acc, item) => acc + item.progressPercent, 0);
  return Math.round(sum / entry.progress.length);
};

const PlaceholderRows = () => (
  <div className="ui-skeleton-block" aria-hidden>
    {[0, 1, 2].map((index) => (
      <div key={index} className="ui-skeleton-line" style={{ width: `${70 + index * 10}%` }} />
    ))}
  </div>
);

export const MyCoursesList = ({ entries, loading }: Props) => {
  if (loading) {
    return (
      <SectionCard title="Мои курсы">
        <PlaceholderRows />
      </SectionCard>
    );
  }

  if (entries.length === 0) {
    return (
      <SectionCard title="Мои курсы">
        <SectionEmpty message="Курсы пока не назначены" />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Мои курсы">
      <ul className="ui-stack" style={{ gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
        {entries.map((entry) => {
          const title =
            entry.course?.title ?? `Курс ${entry.enrollment.courseId ?? entry.enrollment.id}`;
          const percent = computeProgress(entry);
          const href = entry.enrollment.courseId
            ? `/learner/courses/${entry.enrollment.courseId}`
            : `/learner/courses/${entry.enrollment.id}`;
          return (
            <li key={entry.enrollment.id} className="ui-stack" style={{ gap: 4 }}>
              <div className="ui-inline" style={{ justifyContent: 'space-between' }}>
                <Link href={href}>{title}</Link>
                <StatusChip status={entry.enrollment.status} />
              </div>
              <progress max={100} value={percent} aria-label={`Прогресс по курсу ${title}`} />
              <small className="ui-text-muted">{percent}%</small>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};
```

- [x] **Step 2: Commit**

```bash
git add apps/frontend/src/features/learner-home/my-courses-list.tsx
git commit -m "feat(frontend): add MyCoursesList with progress bars for learner home"
```

---

## Task 7: `RoleSwitcher` component

**Files:**

- Create: `apps/frontend/src/features/learner-home/role-switcher-tabs.tsx`

### Behavior

- Reads `useAuth().session`, calls `getAvailableRoles(session)`.
- If the returned array has fewer than 2 options, renders nothing.
- Otherwise renders a horizontal nav with one link per role. The active role link is styled differently (uses `aria-current="page"`).
- "Active" detection: compare each role's `href` with `usePathname()` from `next/navigation`. The role is active if pathname equals its href OR starts with `${href}/`.

> **Why the filename is `role-switcher-tabs.tsx`, not `role-switcher.tsx`:** the logic file is `role-switcher.ts`. Putting both `role-switcher.ts` and `role-switcher.tsx` in the same directory creates a TS module-resolution ambiguity (both could be imported as `./role-switcher`). The component-suffix variant sidesteps this entirely.

- [x] **Step 1: Implement the component**

```tsx
// apps/frontend/src/features/learner-home/role-switcher-tabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '../auth/context';
import { getAvailableRoles } from './role-switcher';

export const RoleSwitcher = () => {
  const { session } = useAuth();
  const pathname = usePathname();
  const options = getAvailableRoles(session);

  if (options.length < 2) return null;

  return (
    <nav className="ui-inline" aria-label="Переключение между кабинетами" style={{ gap: 8 }}>
      {options.map((option) => {
        const isActive = pathname === option.href || pathname?.startsWith(`${option.href}/`);
        return (
          <Link
            key={option.code}
            href={option.href}
            aria-current={isActive ? 'page' : undefined}
            className={`ui-tab ${isActive ? 'ui-tab--active' : ''}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
};
```

- [x] **Step 2: Commit**

```bash
git add apps/frontend/src/features/learner-home/role-switcher-tabs.tsx
git commit -m "feat(frontend): add RoleSwitcher tabs for users with multiple roles"
```

---

## Task 8: `LearnerHomeScreen` — assembled screen

**Files:**

- Create: `apps/frontend/src/features/learner-home/learner-home-screen.tsx`
- Create: `apps/frontend/app/learner/page.tsx`

- [x] **Step 1: Implement the screen**

```tsx
// apps/frontend/src/features/learner-home/learner-home-screen.tsx
'use client';

import { useMemo } from 'react';

import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { MyCoursesList } from './my-courses-list';
import { NextStepCard } from './next-step-card';
import { pickNextStep } from './next-step';
import { RoleSwitcher } from './role-switcher-tabs';
import { useLearnerHomeData } from './use-learner-home-data';

export const LearnerHomeScreen = () => {
  const { session } = useAuth();
  const { data, isLoading, error } = useLearnerHomeData();

  const nextStep = useMemo(() => pickNextStep(data), [data]);
  const greeting = session?.user.displayName
    ? `Здравствуйте, ${session.user.displayName}`
    : 'Главная';

  return (
    <PageContainer>
      <PageHeader title={greeting} subtitle="Главный экран ученика" actions={<RoleSwitcher />} />
      {error ? <SectionError message={error} /> : null}
      <NextStepCard step={nextStep} loading={isLoading} />
      <MyCoursesList entries={data} loading={isLoading} />
    </PageContainer>
  );
};
```

- [x] **Step 2: Implement the route page**

```tsx
// apps/frontend/app/learner/page.tsx
import { LearnerHomeScreen } from '../../src/features/learner-home/learner-home-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function LearnerHomePage() {
  return (
    <ProtectedPage>
      <LearnerHomeScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 3: Add smoke test for the route**

```tsx
// apps/frontend/app/learner/page.test.tsx
import { describe, expect, it } from 'vitest';

import LearnerHomePage from './page';

describe('learner home route', () => {
  it('exports a page component function', () => {
    expect(typeof LearnerHomePage).toBe('function');
  });
});
```

- [x] **Step 4: Run frontend test suite**

Run: `pnpm --filter @cdoprof/frontend exec vitest run`
Expected: all tests pass (existing 90 + new tests from Tasks 2, 3, 4, and the smoke test from Step 3).

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/learner-home/learner-home-screen.tsx \
        apps/frontend/app/learner/page.tsx \
        apps/frontend/app/learner/page.test.tsx
git commit -m "feat(frontend): add /learner home screen with Next Step card"
```

---

## Task 9: Root route redirects learners to `/learner`

**Files:**

- Modify: `apps/frontend/app/page.tsx`

### Why a client-side redirect

Role information lives in `useAuth().session` which is bootstrapped on the client (the API requires the session cookie). A server-side redirect would not have access to the role. So we redirect via `router.replace('/learner')` once `session` is loaded and the user has the `learner` role.

To avoid hijacking the legacy widget grid for admins/teachers who currently use it, we only redirect when the user is _primarily_ a learner: the user has the `learner` role **and** does not currently sit on a path under `/admin` or `/teacher`. On `/` the redirect runs for any learner.

- [x] **Step 1: Add redirect to DashboardPage**

Modify `apps/frontend/app/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../src/components/state-wrappers';
import { useAuth } from '../src/features/auth/context';
import { getPrimaryRoleBlueprint } from '../src/features/navigation/role-blueprints';
import { getJourneyByRole } from '../src/features/navigation/role-journeys';
import {
  getMetricBaseline,
  recordJourneyStep,
  startMetricTimer
} from '../src/lib/analytics/ux-metrics';
import { ProtectedPage } from '../src/widgets/shell/protected-page';

type RoleCode = 'learner' | 'teacher' | 'tenant_admin' | 'platform_admin';

const normalizeRole = (role: string): string => {
  const lowered = role.toLowerCase();
  if (lowered === 'student') return 'learner';
  if (lowered === 'admin') return 'tenant_admin';
  return lowered;
};

// ... widgetCatalog stays unchanged ...

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    const roles = new Set((session.roles ?? []).map(normalizeRole));
    if (roles.has('learner')) {
      router.replace('/learner');
    }
  }, [loading, router, session]);

  // ... rest of the component stays unchanged ...
}
```

> **Concretely:** insert the new `useRouter()` call and `useEffect` block immediately after the existing `useAuth()` and `startMetricTimer` effect. Do not delete the metric `useEffect` or any of the widget grid rendering — non-learner users keep seeing it.

- [x] **Step 2: Verify the existing root-route smoke test still passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run app/smoke.test.tsx`
Expected: PASS (this test only checks the component is a function — no behavior assertion).

- [x] **Step 3: Commit**

```bash
git add apps/frontend/app/page.tsx
git commit -m "feat(frontend): redirect learners from / to /learner home"
```

---

## Task 10: Full verification

- [x] **Step 1: Lint**

Run: `pnpm --filter @cdoprof/frontend run lint`
Expected: no warnings or errors.

- [x] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: clean (no errors).

- [x] **Step 3: Run all frontend tests**

Run: `pnpm --filter @cdoprof/frontend exec vitest run`
Expected: all tests pass. Count should be 90 (current) + 8 (`pickNextStep`) + 9 (`getAvailableRoles` + `getActiveRole`) + 3 (`assembleHomeData`) + 1 (learner page smoke) = 111.

- [x] **Step 4: Manual smoke test in browser** (cannot be automated without jsdom)

1. Start backend: `pnpm --filter @cdoprof/backend run dev`
2. Start frontend: `pnpm --filter @cdoprof/frontend run dev`
3. Log in as a user with `learner` role + at least one active enrollment.
4. Verify: landing on `/` redirects to `/learner` within 1s.
5. Verify: "Следующий шаг" card shows either "Продолжите …" or "Начните …" with a working button that navigates to `/learner/courses/{id}`.
6. Verify: "Мои курсы" list shows each enrollment with a progress bar.
7. Test edge cases:
   - User with no enrollments → empty state copy in Next Step card.
   - User with only completed enrollments → "Все курсы завершены — отлично!".
   - User with `learner` + `teacher` roles → role switcher tabs render at top, clicking "Кабинет преподавателя" navigates to `/teacher/grading-center`.

---

## Definition of Done

- [x] All 10 tasks committed.
- [x] Vitest: 111/111 passing (frontend filter).
- [x] ESLint: clean.
- [x] `tsc --noEmit`: clean.
- [x] Manual smoke walkthrough on a fresh learner account completes the goal: from `/` they see "Следующий шаг" within 1s and one click takes them to the right course.
- [x] Spec §4.2 requirements traced:
  - ✅ Центральная карточка "Следующий шаг" — `NextStepCard` with `pickNextStep` cross-course logic.
  - ✅ Список курсов с прогресс-барами — `MyCoursesList`.
  - ❌ Дедлайны — out of scope (data model lacks `dueAt` on `Enrollment`); follow-up plan needed.
  - ✅ Переключатель ролей — `RoleSwitcher`.

---

## What's NOT in this plan (deferred)

- **Deadlines on courses.** Requires adding `dueAt` to the `Enrollment` model (backend migration + DTO + UI). Separate plan.
- **Backend `/me/next-step` aggregation endpoint.** Not needed at V1 scale (~tens of enrollments per learner). If performance becomes a concern (10s+ courses each with 100s of progress rows), add it then.
- **"Last touched" sort.** Currently picks the _first_ in-progress enrollment by insertion order. If we add `progress.updatedAt` to the picker, we can sort by recency — out of scope for this plan; revisit after observing real user behavior.
- **Role state persistence.** Active role is derived from the current URL, so the choice is implicitly stored. If we later need a "remember last view" preference, add localStorage and a server-side preferences row.
- **Personalized greeting beyond `displayName`.** Time-of-day greeting, holiday banners, etc. — defer.
