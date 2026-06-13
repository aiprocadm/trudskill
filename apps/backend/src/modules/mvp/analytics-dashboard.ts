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
