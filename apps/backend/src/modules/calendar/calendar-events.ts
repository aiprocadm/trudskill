/**
 * Сборщик событий календаря из снимка центра и задач (срез 24.1) — чистые функции.
 *
 * Событие попадает в период, если хотя бы один его день внутри [from; to]: окно экзамена,
 * начавшееся до периода и закончившееся в нём, видно. Сравнение идёт по датам `YYYY-MM-DD` —
 * ISO-моменты сводятся к дате (центры работают в одном поясе, как и остальные даты групп).
 */
import { GROUP_EVENT_TYPES } from './calendar.types.js';

import type { CalendarEvent, CalendarEventType, CalendarQuery } from './calendar.types.js';
import type {
  Counterparty,
  Course,
  Enrollment,
  GroupCourse,
  GroupEntity
} from '../mvp/mvp.types.js';
import type { Task } from '../tasks/tasks.types.js';

export interface CalendarSnapshot {
  groups: readonly GroupEntity[];
  groupCourses: readonly GroupCourse[];
  courses: readonly Course[];
  counterparties: readonly Counterparty[];
  enrollments: readonly Enrollment[];
}

const dayOf = (value: string | undefined): string | undefined =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;

const overlaps = (start: string, end: string, from: string, to: string): boolean =>
  start <= to && end >= from;

const TYPE_ORDER: Record<CalendarEventType, number> = {
  exam: 0,
  group_start: 1,
  group_end: 2,
  deadline: 3,
  task: 4,
  materials_access_end: 5,
  exam_window: 6,
  practice: 7
};

export const sortEvents = (events: CalendarEvent[]): CalendarEvent[] =>
  events.sort(
    (a, b) =>
      a.startsAt.slice(0, 10).localeCompare(b.startsAt.slice(0, 10)) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.title.localeCompare(b.title, 'ru')
  );

/**
 * Какие группы смотреть: «мои» — где человек ответственный или преподаватель курса; отборы по
 * статусу, компании и направлению (через курсы группы).
 */
export const selectGroups = (
  snapshot: CalendarSnapshot,
  tenantId: string,
  query: Pick<CalendarQuery, 'mine' | 'groupStatus' | 'counterpartyId' | 'directionId'>,
  userId: string
): GroupEntity[] => {
  const courseDirection = new Map(
    snapshot.courses.filter((c) => c.tenantId === tenantId).map((c) => [c.id, c.directionId])
  );
  const coursesOf = new Map<string, GroupCourse[]>();
  for (const gc of snapshot.groupCourses) {
    if (gc.tenantId !== tenantId) continue;
    coursesOf.set(gc.groupId, [...(coursesOf.get(gc.groupId) ?? []), gc]);
  }
  return snapshot.groups.filter((group) => {
    if (group.tenantId !== tenantId) return false;
    if (query.groupStatus && group.status !== query.groupStatus) return false;
    if (query.counterpartyId && group.counterpartyId !== query.counterpartyId) return false;
    const courses = coursesOf.get(group.id) ?? [];
    if (
      query.directionId &&
      !courses.some((gc) => courseDirection.get(gc.courseId) === query.directionId)
    ) {
      return false;
    }
    if (query.mine) {
      return (
        group.responsibleUserId === userId || courses.some((gc) => gc.teacherUserId === userId)
      );
    }
    return true;
  });
};

/** События из дат групп: начало, окончание, экзамен, окно экзамена, конец доступа, практика. */
export const groupEvents = (
  groups: readonly GroupEntity[],
  snapshot: CalendarSnapshot,
  tenantId: string,
  range: { from: string; to: string },
  types: ReadonlySet<CalendarEventType>
): CalendarEvent[] => {
  if (!GROUP_EVENT_TYPES.some((type) => types.has(type))) return [];
  const courseTitle = new Map(
    snapshot.courses.filter((c) => c.tenantId === tenantId).map((c) => [c.id, c.title])
  );
  const firstCourse = new Map<string, string>();
  for (const gc of snapshot.groupCourses) {
    if (gc.tenantId !== tenantId || firstCourse.has(gc.groupId)) continue;
    const title = courseTitle.get(gc.courseId);
    if (title) firstCourse.set(gc.groupId, title);
  }
  const counterpartyName = new Map(
    snapshot.counterparties.filter((c) => c.tenantId === tenantId).map((c) => [c.id, c.name])
  );
  const learners = new Map<string, number>();
  for (const e of snapshot.enrollments) {
    if (e.tenantId !== tenantId || e.status === 'cancelled') continue;
    learners.set(e.groupId, (learners.get(e.groupId) ?? 0) + 1);
  }

  const events: CalendarEvent[] = [];
  for (const group of groups) {
    const course = firstCourse.get(group.id);
    const company = group.counterpartyId ? counterpartyName.get(group.counterpartyId) : undefined;
    const base = {
      source: { type: 'group' as const, id: group.id },
      group: { id: group.id, code: group.code },
      ...(company ? { counterparty: { name: company } } : {})
    };
    const label = (what: string, withCompany = false) =>
      [what, group.code, course, withCompany ? company : undefined].filter(Boolean).join(' · ');
    const day = (
      type: CalendarEventType,
      date: string | undefined,
      title: string,
      extra: Partial<CalendarEvent> = {}
    ) => {
      if (!types.has(type) || !date || !overlaps(date, date, range.from, range.to)) return;
      events.push({
        id: `${type}:${group.id}`,
        type,
        title,
        startsAt: date,
        allDay: true,
        ...base,
        ...extra
      });
    };
    const span = (
      type: CalendarEventType,
      start: string | undefined,
      end: string | undefined,
      title: string
    ) => {
      if (!types.has(type) || !start || !end || !overlaps(start, end, range.from, range.to)) return;
      events.push({
        id: `${type}:${group.id}`,
        type,
        title,
        startsAt: start,
        endsAt: end,
        allDay: true,
        ...base
      });
    };

    day('group_start', dayOf(group.startDate), label('Начало обучения'));
    day('group_end', dayOf(group.endDate), label('Окончание группы'));
    day('exam', dayOf(group.examDate), label('Экзамен', true), {
      learnersCount: learners.get(group.id) ?? 0
    });
    span(
      'exam_window',
      dayOf(group.examAccessFrom),
      dayOf(group.examAccessTo),
      label('Доступ к экзамену')
    );
    day(
      'materials_access_end',
      dayOf(group.materialsAccessUntil),
      label('Конец доступа к материалам')
    );
    span('practice', dayOf(group.practiceFrom), dayOf(group.practiceTo), label('Практика'));
  }
  return events;
};

/**
 * Окончания обучения (прежний «Календарь окончаний») — одно событие на группу и день (РМ140):
 * 13 755 слушателей построчно превратили бы месяц в сплошной список.
 */
export const deadlineEvents = (
  groups: readonly GroupEntity[],
  snapshot: CalendarSnapshot,
  tenantId: string,
  range: { from: string; to: string }
): CalendarEvent[] => {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const buckets = new Map<string, { group: GroupEntity; day: string; count: number }>();
  for (const e of snapshot.enrollments) {
    if (e.tenantId !== tenantId || (e.status !== 'active' && e.status !== 'pending')) continue;
    const group = byId.get(e.groupId);
    const day = dayOf(e.plannedEndAt);
    if (!group || !day || day < range.from || day > range.to) continue;
    const key = `${group.id}:${day}`;
    const bucket = buckets.get(key) ?? { group, day, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, { group, day, count }]) => ({
    id: `deadline:${key}`,
    type: 'deadline',
    title: `Окончание обучения · ${group.code} · слушателей: ${count}`,
    startsAt: day,
    allDay: true,
    source: { type: 'group', id: group.id },
    group: { id: group.id, code: group.code },
    learnersCount: count
  }));
};

/** Задачи со сроком в периоде; просрочка — срок прошёл, а задача не выполнена. */
export const taskEvents = (
  tasks: readonly Task[],
  range: { from: string; to: string },
  now: Date
): CalendarEvent[] =>
  tasks.flatMap((task) => {
    const due = task.dueAt ?? task.startsAt;
    const day = dayOf(due);
    if (!due || !day || day < range.from || day > range.to) return [];
    const open = task.status === 'new' || task.status === 'in_progress';
    return [
      {
        id: `task:${task.id}`,
        type: 'task' as const,
        title: task.title,
        startsAt: task.allDay ? day : due,
        allDay: task.allDay,
        source: { type: 'task' as const, id: task.id },
        ...(open && task.dueAt && Date.parse(task.dueAt) < now.getTime() ? { overdue: true } : {})
      }
    ];
  });
