import type { Course, Enrollment, GroupCourse, GroupEntity, TestEntity } from '../mvp.types.js';

/**
 * ФТ-H2 (Фаза 5 Task 2): дашборд методиста — «группы и дедлайны».
 *
 * **Важное ограничение, вскрытое разведкой: понятия «МОЯ группа» в системе нет.**
 * У `learning.groups` нет ни куратора, ни ответственного методиста — только код, имя
 * и необязательная привязка к заказчику. План задачи был написан со словами «мои
 * группы», но заводить ради этого миграцию и поле «ответственный» здесь нельзя: кто
 * назначает куратора, обязателен ли он и что делать с уже существующими группами —
 * продуктовые решения, а не деталь дашборда.
 *
 * Поэтому дашборд отвечает на вопрос **«где сейчас горит по обучению»** в масштабе
 * центра — ровно то, что ТЗ и просит («методист — группы и дедлайны»), и ровно то,
 * что методист и так имеет право видеть по `groups.read`.
 *
 * Всё считается ЧИСТОЙ функцией от снимка состояния и даты `asOf`: дашборд, который
 * нельзя проверить тестом на конкретную дату, начинает врать незаметно.
 */

/** Горизонт «ближайших» дедлайнов по умолчанию. */
export const DEADLINE_HORIZON_DAYS = 14;

export interface MethodistDashboardInput {
  groups: GroupEntity[];
  groupCourses: GroupCourse[];
  enrollments: Enrollment[];
  courses: Course[];
  tests: TestEntity[];
}

export interface GroupDeadline {
  groupId: string;
  groupName: string;
  /** Ближайшая плановая дата окончания среди незавершённых зачислений группы. */
  dueAt: string;
  /** Сколько человек эта дата затрагивает — иначе не отличить одного отставшего от всей группы. */
  learnersCount: number;
  daysLeft: number;
}

export interface OverdueGroup {
  groupId: string;
  groupName: string;
  /** Самая ранняя просроченная дата — по ней видно, насколько запущено. */
  since: string;
  learnersCount: number;
  daysOverdue: number;
}

export interface CourseWithoutExam {
  courseId: string;
  courseTitle: string;
  /**
   * Группа указывается только тем, кому разрешено видеть состав обучения. Методист
   * прав на группы и зачисления НЕ имеет (проверено на живой базе), и название
   * группы в его выдаче было бы утечкой — поэтому поля необязательные.
   */
  groupId?: string;
  groupName?: string;
}

/**
 * Курсы без ОПУБЛИКОВАННОГО итогового теста — разговор о содержании обучения, а не
 * о людях. Итоговый тест — тот, что не привязан к модулю (`moduleId` пуст); тесты
 * модулей промежуточные и экзамена не заменяют.
 */
export function coursesMissingFinalExam(
  courses: Course[],
  tests: TestEntity[]
): CourseWithoutExam[] {
  const covered = new Set(
    tests
      .filter((test) => !test.moduleId && !test.isArchived && Boolean(test.publishedAt))
      .map((test) => test.courseId)
  );
  return courses
    .filter((course) => !course.isArchived && !covered.has(course.id))
    .map((course) => ({ courseId: course.id, courseTitle: course.title }));
}

export interface MethodistDashboard {
  asOf: string;
  horizonDays: number;
  upcomingDeadlines: GroupDeadline[];
  overdueGroups: OverdueGroup[];
  coursesWithoutExam: CourseWithoutExam[];
  totals: {
    activeGroups: number;
    activeLearners: number;
    upcomingDeadlines: number;
    overdueGroups: number;
    coursesWithoutExam: number;
  };
}

/** Целые дни между двумя ISO-датами; отрицательное — дата в прошлом. */
const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(fromIso.slice(0, 10));
  const to = Date.parse(toIso.slice(0, 10));
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
};

/** Зачисления, по которым обучение ещё идёт: завершённые и отменённые дедлайна не имеют. */
const isOpen = (enrollment: Enrollment): boolean =>
  enrollment.status === 'active' || enrollment.status === 'pending';

export function buildMethodistDashboard(
  input: MethodistDashboardInput,
  asOf: string,
  horizonDays: number = DEADLINE_HORIZON_DAYS
): MethodistDashboard {
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const courseById = new Map(input.courses.map((course) => [course.id, course]));

  // Сгруппировать открытые зачисления по группе, оставив только те, где срок задан:
  // зачисление без плановой даты — не «бессрочное», а просто ненастроенное, и
  // показывать его как дедлайн значило бы придумать дату за методиста.
  const openByGroup = new Map<string, Enrollment[]>();
  for (const enrollment of input.enrollments) {
    if (!isOpen(enrollment)) continue;
    const list = openByGroup.get(enrollment.groupId) ?? [];
    list.push(enrollment);
    openByGroup.set(enrollment.groupId, list);
  }

  const upcomingDeadlines: GroupDeadline[] = [];
  const overdueGroups: OverdueGroup[] = [];

  for (const [groupId, enrollments] of openByGroup) {
    const group = groupById.get(groupId);
    if (!group) continue;
    const groupName = group.name || group.code || groupId;

    const dated = enrollments.filter(
      (enrollment): enrollment is Enrollment & { plannedEndAt: string } =>
        Boolean(enrollment.plannedEndAt)
    );
    if (dated.length === 0) continue;

    const overdue = dated.filter((enrollment) => daysBetween(asOf, enrollment.plannedEndAt) < 0);
    if (overdue.length > 0) {
      const since = overdue
        .map((enrollment) => enrollment.plannedEndAt)
        .sort((a, b) => a.localeCompare(b))[0]!;
      overdueGroups.push({
        groupId,
        groupName,
        since,
        learnersCount: overdue.length,
        daysOverdue: Math.abs(daysBetween(asOf, since))
      });
    }

    // Просроченные в «ближайшие» не попадают: они уже в своём разделе, и дублировать
    // их значило бы завысить количество дел вдвое.
    const ahead = dated
      .map((enrollment) => ({ enrollment, daysLeft: daysBetween(asOf, enrollment.plannedEndAt) }))
      .filter((item) => item.daysLeft >= 0 && item.daysLeft <= horizonDays);
    if (ahead.length > 0) {
      const nearest = ahead.sort((a, b) => a.daysLeft - b.daysLeft)[0]!;
      upcomingDeadlines.push({
        groupId,
        groupName,
        dueAt: nearest.enrollment.plannedEndAt,
        learnersCount: ahead.filter(
          (item) => item.enrollment.plannedEndAt === nearest.enrollment.plannedEndAt
        ).length,
        daysLeft: nearest.daysLeft
      });
    }
  }

  // Курс В ГРУППЕ без опубликованного итогового теста: слушатели дойдут до конца
  // программы и упрутся в отсутствующий экзамен.
  const publishedFinalExamCourseIds = new Set(
    input.tests
      .filter((test) => !test.moduleId && !test.isArchived && Boolean(test.publishedAt))
      .map((test) => test.courseId)
  );
  const coursesWithoutExam: CourseWithoutExam[] = [];
  const seenPair = new Set<string>();
  for (const groupCourse of input.groupCourses) {
    const group = groupById.get(groupCourse.groupId);
    if (!group) continue;
    if (publishedFinalExamCourseIds.has(groupCourse.courseId)) continue;
    const key = `${groupCourse.groupId}:${groupCourse.courseId}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    coursesWithoutExam.push({
      groupId: groupCourse.groupId,
      groupName: group.name || group.code || groupCourse.groupId,
      courseId: groupCourse.courseId,
      courseTitle: courseById.get(groupCourse.courseId)?.title ?? groupCourse.courseId
    });
  }

  upcomingDeadlines.sort((a, b) => a.daysLeft - b.daysLeft);
  overdueGroups.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const activeLearners = new Set(
    input.enrollments.filter(isOpen).map((enrollment) => enrollment.learnerId)
  ).size;

  return {
    asOf,
    horizonDays,
    upcomingDeadlines,
    overdueGroups,
    coursesWithoutExam,
    totals: {
      activeGroups: openByGroup.size,
      activeLearners,
      upcomingDeadlines: upcomingDeadlines.length,
      overdueGroups: overdueGroups.length,
      coursesWithoutExam: coursesWithoutExam.length
    }
  };
}
