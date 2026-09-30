import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  deadlineEvents,
  groupEvents,
  selectGroups,
  sortEvents,
  taskEvents
} from './calendar-events.js';
import {
  CALENDAR_EVENT_TYPES,
  DEFAULT_MAX_RANGE_DAYS,
  GROUP_EVENT_TYPES
} from './calendar.types.js';
import { MvpService } from '../mvp/mvp.service.js';
import { TasksService } from '../tasks/tasks.service.js';

import type { CalendarEvent, CalendarEventType, CalendarQuery } from './calendar.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { Task } from '../tasks/tasks.types.js';

/** Сколько задач брать в период: календарь — не реестр задач, тысячи на неделю не бывает. */
const TASKS_PAGE = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Агрегатор календаря (ТЗ перехода §5, МГ-G1.1/G3.3; срез 24.1, РМ138–РМ140).
 *
 * Каждый тип события виден, только если у человека есть право читать его источник: группы —
 * `groups.read`, окончания обучения — `enrollments.read`, задачи — `tasks.read` (и по правилам
 * задач: свои, а все — с `tasks.manage_all`). Период — не больше 93 дней (ТЗ §18).
 */
@Injectable()
export class CalendarService {
  constructor(
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(TasksService) private readonly tasks: TasksService
  ) {}

  async events(
    tenantId: string,
    context: RequestContext,
    query: CalendarQuery,
    now: Date = new Date(),
    maxRangeDays = DEFAULT_MAX_RANGE_DAYS
  ): Promise<{ items: CalendarEvent[]; total: number }> {
    const range = this.assertRange(query.from, query.to, maxRangeDays);
    const permissions = new Set(context.permissions ?? []);
    const userId = context.userId ?? '';
    const allowed = new Set<CalendarEventType>(
      CALENDAR_EVENT_TYPES.filter((type) => {
        if (GROUP_EVENT_TYPES.includes(type)) return permissions.has('groups.read');
        if (type === 'deadline') return permissions.has('enrollments.read');
        return permissions.has('tasks.read');
      })
    );
    const types = new Set(
      (query.types?.length ? query.types : CALENDAR_EVENT_TYPES).filter((t) => allowed.has(t))
    );

    const events: CalendarEvent[] = [];
    if (GROUP_EVENT_TYPES.some((t) => types.has(t)) || types.has('deadline')) {
      const snapshot = this.mvp.calendarSnapshot(tenantId);
      const groups = selectGroups(snapshot, tenantId, query, userId);
      events.push(...groupEvents(groups, snapshot, tenantId, range, types));
      if (types.has('deadline')) events.push(...deadlineEvents(groups, snapshot, tenantId, range));
    }
    /* Отбор по группе (статус, компания, направление) к задачам не относится — с ним их не показываем. */
    const groupFilter = Boolean(query.groupStatus || query.counterpartyId || query.directionId);
    if (types.has('task') && !groupFilter) {
      events.push(
        ...taskEvents(
          await this.visibleTasks(tenantId, context, range, Boolean(query.mine)),
          range,
          now
        )
      );
    }

    const needle = query.q?.trim().toLowerCase();
    const items = sortEvents(
      needle ? events.filter((e) => e.title.toLowerCase().includes(needle)) : events
    );
    return { items, total: items.length };
  }

  /** Задачи периода по правилам задач: без `tasks.manage_all` или с «мои» — только свои. */
  private async visibleTasks(
    tenantId: string,
    context: RequestContext,
    range: { from: string; to: string },
    mine: boolean
  ): Promise<Task[]> {
    const page = {
      page: 1,
      pageSize: TASKS_PAGE,
      dueFrom: range.from,
      dueTo: `${range.to}T23:59:59.999Z`
    };
    if (!mine && this.tasks.actorOf(context).manageAll) {
      return (await this.tasks.list(tenantId, context, { filter: 'all', ...page })).items;
    }
    const [assigned, created] = await Promise.all([
      this.tasks.list(tenantId, context, { filter: 'assigned_to_me', ...page }),
      this.tasks.list(tenantId, context, { filter: 'created_by_me', ...page })
    ]);
    return [
      ...new Map([...assigned.items, ...created.items].map((task) => [task.id, task])).values()
    ];
  }

  private assertRange(
    from: string,
    to: string,
    maxRangeDays: number
  ): { from: string; to: string } {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      throw new BadRequestException({
        code: 'calendar_range_invalid',
        message: 'Период календаря задан неверно: дата «по» раньше даты «с».'
      });
    }
    if ((end - start) / DAY_MS + 1 > maxRangeDays) {
      throw new BadRequestException({
        code: 'range_too_wide',
        message: `Календарь показывает не больше ${maxRangeDays} дней за раз — сузьте период.`
      });
    }
    return { from, to };
  }
}
