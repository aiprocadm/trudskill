import type { Enrollment, GroupCourse } from './mvp.types.js';

/**
 * Phase 2 Plan C — per-group или per-counterparty прогресс summary.
 *
 * **DEVIATION D3** (vs original plan): план предполагал `enrollment.courseId` и
 * pre-computed `completionRateByEnrollment` (0..1 fraction). В реальной модели:
 * - `Enrollment` это запись «ученик ↔ группа» (поля: groupId/learnerId/status),
 *   без courseId.
 * - Программа = `GroupCourse[]` (group ↔ courses).
 * - Existing `kpiSnapshot` (mvp.service.ts:~1237) использует **binary** сигнал
 *   `status === 'completed'`, не 0..1 fraction.
 *
 * Соответственно V1 aggregator:
 * - `avgCompletionRate` = доля enrollments со `status === 'completed'`.
 * - Bucket: completed (status='completed') / inProgress (status='active') /
 *   notStarted (всё остальное — pending/cancelled/suspended).
 * - Per-course breakdown идёт через `groupCourses (groupId, courseId)`:
 *   для каждого course total = сумма enrollments всех групп этого курса,
 *   completed = сумма enrollments со status='completed'.
 *
 * V1.1 опции (если потребуется): использовать `materialProgress`/`courseProgress`
 * для granular 0..1 rate per-enrollment-per-course.
 */
export interface GroupProgressSummary {
  groupId?: string;
  counterpartyId?: string;
  totalLearners: number;
  enrollments: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  /** 0..1 — доля enrollments со status='completed'. */
  avgCompletionRate: number;
  perCourse: Array<{ courseId: string; total: number; completed: number }>;
}

export interface AggregateInput {
  /** Enrollments, заранее отфильтрованные caller'ом по tenant. */
  enrollments: Pick<Enrollment, 'id' | 'groupId' | 'learnerId' | 'status'>[];
  /** GroupCourses, заранее отфильтрованные caller'ом по tenant. */
  groupCourses: Pick<GroupCourse, 'groupId' | 'courseId'>[];
}

/**
 * Pure-function summary для одной группы. Caller передаёт snapshot tenant'а;
 * функция фильтрует по `groupId`.
 */
export function summarizeGroupProgress(
  groupId: string,
  input: AggregateInput
): GroupProgressSummary {
  const groupEnrollments = input.enrollments.filter((e) => e.groupId === groupId);
  const groupGroupCourses = input.groupCourses.filter((gc) => gc.groupId === groupId);
  return summarize({ groupId }, groupEnrollments, groupGroupCourses);
}

/**
 * Pure-function summary для всех групп компании-клиента.
 * Caller заранее отфильтровывает enrollments + groupCourses по группам
 * этого counterparty (см. `MvpService.getCounterpartyProgressSummary` в Task 6).
 */
export function summarizeCounterpartyProgress(
  counterpartyId: string,
  input: AggregateInput
): GroupProgressSummary {
  return summarize({ counterpartyId }, input.enrollments, input.groupCourses);
}

function bucketByStatus(status: string): 'completed' | 'inProgress' | 'notStarted' {
  if (status === 'completed') return 'completed';
  if (status === 'active') return 'inProgress';
  return 'notStarted';
}

function summarize(
  context: { groupId?: string; counterpartyId?: string },
  enrollments: AggregateInput['enrollments'],
  groupCourses: AggregateInput['groupCourses']
): GroupProgressSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  const learnerIds = new Set<string>();

  for (const e of enrollments) {
    const bucket = bucketByStatus(e.status);
    if (bucket === 'completed') completed += 1;
    else if (bucket === 'inProgress') inProgress += 1;
    else notStarted += 1;
    learnerIds.add(e.learnerId);
  }

  const total = enrollments.length;
  const avgCompletionRate = total === 0 ? 0 : completed / total;

  const enrollmentsByGroup = new Map<string, AggregateInput['enrollments']>();
  for (const e of enrollments) {
    const bucketArr = enrollmentsByGroup.get(e.groupId);
    if (bucketArr) bucketArr.push(e);
    else enrollmentsByGroup.set(e.groupId, [e]);
  }

  const groupsByCourse = new Map<string, Set<string>>();
  for (const gc of groupCourses) {
    const groups = groupsByCourse.get(gc.courseId);
    if (groups) groups.add(gc.groupId);
    else groupsByCourse.set(gc.courseId, new Set([gc.groupId]));
  }

  const perCourse: Array<{ courseId: string; total: number; completed: number }> = [];
  for (const [courseId, groupIds] of groupsByCourse) {
    let courseTotal = 0;
    let courseCompleted = 0;
    for (const gId of groupIds) {
      const groupEnr = enrollmentsByGroup.get(gId) ?? [];
      courseTotal += groupEnr.length;
      courseCompleted += groupEnr.filter((e) => e.status === 'completed').length;
    }
    perCourse.push({ courseId, total: courseTotal, completed: courseCompleted });
  }

  return {
    ...(context.groupId !== undefined ? { groupId: context.groupId } : {}),
    ...(context.counterpartyId !== undefined ? { counterpartyId: context.counterpartyId } : {}),
    totalLearners: learnerIds.size,
    enrollments: { total, completed, inProgress, notStarted },
    avgCompletionRate,
    perCourse
  };
}
