import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CalendarEventsQuery } from './calendar.request-dto.js';
import { CalendarService } from './calendar.service.js';
import { AuditService } from '../audit/audit.service.js';
import { InMemoryTasksRepository } from '../tasks/in-memory-tasks.repository.js';
import { TasksService } from '../tasks/tasks.service.js';

import type { CalendarSnapshot } from './calendar-events.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { MvpService } from '../mvp/mvp.service.js';
import type { Task } from '../tasks/tasks.types.js';

const T = 'tenant_a';
const NOW = new Date('2026-12-15T09:00:00Z');
const base = { tenantId: T, status: 'active', createdAt: '', updatedAt: '' };
const STAFF = ['groups.read', 'enrollments.read', 'tasks.read', 'calendar.read'];
const ctx = (userId: string, permissions: string[] = STAFF): RequestContext =>
  ({ tenantId: T, userId, permissions, requestId: 'r', correlationId: 'c' }) as RequestContext;

const snapshot = (): CalendarSnapshot => ({
  groups: [
    {
      ...base,
      id: 'g1',
      code: '264501',
      name: '264501',
      status: 'in_progress',
      counterpartyId: 'cp1',
      responsibleUserId: 'u_curator',
      startDate: '2026-12-01',
      endDate: '2026-12-20',
      examDate: '2026-12-18',
      examAccessFrom: '2026-12-10T00:00:00.000Z',
      examAccessTo: '2026-12-19T00:00:00.000Z',
      materialsAccessUntil: '2027-01-31'
    },
    {
      ...base,
      id: 'g2',
      code: '264502',
      name: '264502',
      status: 'recruiting',
      startDate: '2026-12-16',
      endDate: '2027-02-01'
    },
    {
      ...base,
      tenantId: 'tenant_b',
      id: 'g_other',
      code: 'ЧУЖАЯ',
      name: 'x',
      status: 'in_progress',
      examDate: '2026-12-17'
    }
  ] as never,
  groupCourses: [
    { ...base, id: 'gc1', groupId: 'g1', courseId: 'c1', sortOrder: 0 },
    { ...base, id: 'gc2', groupId: 'g2', courseId: 'c1', sortOrder: 0, teacherUserId: 'u_teacher' }
  ] as never,
  courses: [
    { ...base, id: 'c1', code: 'ПБ', title: 'Пожарная безопасность', directionId: 'd1' }
  ] as never,
  counterparties: [{ ...base, id: 'cp1', code: 'К', name: 'ООО «Конкретсити»' }] as never,
  enrollments: [
    {
      ...base,
      id: 'e1',
      groupId: 'g1',
      learnerId: 'l1',
      status: 'active',
      enrolledAt: '',
      plannedEndAt: '2026-12-20T00:00:00.000Z'
    },
    {
      ...base,
      id: 'e2',
      groupId: 'g1',
      learnerId: 'l2',
      status: 'active',
      enrolledAt: '',
      plannedEndAt: '2026-12-20T00:00:00.000Z'
    },
    {
      ...base,
      id: 'e3',
      groupId: 'g1',
      learnerId: 'l3',
      status: 'cancelled',
      enrolledAt: '',
      plannedEndAt: '2026-12-20T00:00:00.000Z'
    }
  ] as never
});

const task = (id: string, patch: Partial<Task>): Task =>
  ({
    id,
    tenantId: T,
    title: `Задача ${id}`,
    status: 'new',
    priority: 'normal',
    allDay: false,
    creatorUserId: 'u_boss',
    links: {},
    assignees: [],
    fileIds: [],
    createdAt: '2026-12-01T00:00:00.000Z',
    updatedAt: '2026-12-01T00:00:00.000Z',
    ...patch
  }) as Task;

const make = async (snap: CalendarSnapshot = snapshot()) => {
  const repo = new InMemoryTasksRepository();
  await repo.insert(
    task('t_mine', {
      dueAt: '2026-12-14T10:00:00.000Z',
      assignees: [{ userId: 'u_curator', state: 'assigned', updatedAt: '' }]
    })
  );
  await repo.insert(task('t_other', { dueAt: '2026-12-16T10:00:00.000Z' }));
  const tasks = new TasksService(repo, new AuditService());
  const mvp = { calendarSnapshot: () => snap } as unknown as MvpService;
  return new CalendarService(mvp, tasks);
};

const week = { from: '2026-12-14', to: '2026-12-20' };

describe('календарь: события из дат групп, окончаний и задач (МГ-G1.1, срез 24.1)', () => {
  it('экзамен с компанией и числом слушателей; окно экзамена, начавшееся до недели, тоже видно', async () => {
    const service = await make();
    const { items } = await service.events(T, ctx('u_curator'), week, NOW);
    const exam = items.find((e) => e.type === 'exam')!;
    expect(exam).toMatchObject({
      startsAt: '2026-12-18',
      title: 'Экзамен · 264501 · Пожарная безопасность · ООО «Конкретсити»',
      learnersCount: 2,
      group: { id: 'g1', code: '264501' }
    });
    expect(items.find((e) => e.type === 'exam_window')).toMatchObject({
      startsAt: '2026-12-10',
      endsAt: '2026-12-19'
    });
    expect(items.some((e) => e.type === 'materials_access_end')).toBe(false);
    expect(items.some((e) => e.group?.code === 'ЧУЖАЯ')).toBe(false);
  });

  it('окончания обучения — одно событие на группу и день, без отчисленных (РМ140)', async () => {
    const service = await make();
    const { items } = await service.events(
      T,
      ctx('u_curator'),
      { ...week, types: ['deadline'] },
      NOW
    );
    expect(items).toEqual([
      expect.objectContaining({
        type: 'deadline',
        startsAt: '2026-12-20',
        learnersCount: 2,
        title: 'Окончание обучения · 264501 · слушателей: 2'
      })
    ]);
  });

  it('тип виден только с правом на его источник', async () => {
    const service = await make();
    const noEnrollments = await service.events(
      T,
      ctx('u_curator', ['groups.read', 'calendar.read']),
      week,
      NOW
    );
    expect(new Set(noEnrollments.items.map((e) => e.type)).has('deadline')).toBe(false);
    expect(noEnrollments.items.some((e) => e.type === 'task')).toBe(false);
    const onlyTasks = await service.events(
      T,
      ctx('u_curator', ['tasks.read', 'calendar.read']),
      week,
      NOW
    );
    expect(onlyTasks.items.map((e) => e.type)).toEqual(['task']);
  });

  it('задачи — свои; все — только с tasks.manage_all; просрочка отмечена', async () => {
    const service = await make();
    const own = await service.events(T, ctx('u_curator'), { ...week, types: ['task'] }, NOW);
    expect(own.items.map((e) => e.id)).toEqual(['task:t_mine']);
    expect(own.items[0]).toMatchObject({ overdue: true });
    const all = await service.events(
      T,
      ctx('u_boss', [...STAFF, 'tasks.manage_all']),
      { ...week, types: ['task'] },
      NOW
    );
    expect(all.items.map((e) => e.id).sort()).toEqual(['task:t_mine', 'task:t_other']);
  });

  it('«мои»: группы, где я ответственный или преподаватель курса', async () => {
    const service = await make();
    const curator = await service.events(
      T,
      ctx('u_curator'),
      { ...week, mine: true, types: ['group_start', 'exam'] },
      NOW
    );
    expect(curator.items.map((e) => e.group?.code)).toEqual(['264501']);
    const teacher = await service.events(
      T,
      ctx('u_teacher'),
      { ...week, mine: true, types: ['group_start', 'exam'] },
      NOW
    );
    expect(teacher.items.map((e) => e.id)).toEqual(['group_start:g2']);
  });

  it('отборы по компании, направлению и статусу; задачи при отборе по группе не показываются', async () => {
    const service = await make();
    const byCompany = await service.events(
      T,
      ctx('u_boss', [...STAFF, 'tasks.manage_all']),
      { ...week, counterpartyId: 'cp1' },
      NOW
    );
    expect(new Set(byCompany.items.map((e) => e.group?.code))).toEqual(new Set(['264501']));
    const byStatus = await service.events(
      T,
      ctx('u_curator'),
      { ...week, groupStatus: 'recruiting' },
      NOW
    );
    expect(byStatus.items.map((e) => e.id)).toEqual(['group_start:g2']);
    const byDirection = await service.events(
      T,
      ctx('u_curator'),
      { ...week, directionId: 'd_none' },
      NOW
    );
    expect(byDirection.items).toEqual([]);
  });

  it('больше 93 дней — 400 range_too_wide; «по» раньше «с» — 400 словами', async () => {
    const service = await make();
    await expect(
      service.events(T, ctx('u'), { from: '2026-01-01', to: '2026-04-30' }, NOW)
    ).rejects.toMatchObject({
      response: { code: 'range_too_wide' }
    });
    await expect(
      service.events(T, ctx('u'), { from: '2026-12-20', to: '2026-12-14' }, NOW)
    ).rejects.toMatchObject({
      response: { code: 'calendar_range_invalid' }
    });
    await expect(
      service.events(T, ctx('u'), { from: '2026-01-01', to: '2026-04-03' }, NOW)
    ).resolves.toBeDefined();
  });

  it('неделя на объёме CDOPROF (25 000 групп, 100 000 зачислений) — не дольше 500 мс', async () => {
    const big = snapshot();
    const groups = [];
    const enrollments = [];
    for (let i = 0; i < 25_000; i += 1) {
      const day = String(1 + (i % 28)).padStart(2, '0');
      groups.push({
        ...base,
        id: `gb${i}`,
        code: `N${i}`,
        name: `N${i}`,
        status: 'in_progress',
        startDate: `2026-12-${day}`,
        endDate: `2026-12-${day}`,
        examDate: `2026-12-${day}`
      });
      for (let j = 0; j < 4; j += 1) {
        enrollments.push({
          ...base,
          id: `eb${i}_${j}`,
          groupId: `gb${i}`,
          learnerId: `l${j}`,
          status: 'active',
          enrolledAt: '',
          plannedEndAt: `2026-12-${day}T00:00:00.000Z`
        });
      }
    }
    const service = await make({
      ...big,
      groups: groups as never,
      enrollments: enrollments as never
    });
    const started = performance.now();
    const result = await service.events(T, ctx('u_curator'), week, NOW);
    const elapsed = performance.now() - started;
    expect(result.total).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('запрос календаря', () => {
  const errorsOf = (raw: object) =>
    validateSync(plainToInstance(CalendarEventsQuery, raw)).map((e) => e.property);

  it('даты — ГГГГ-ММ-ДД; типы через запятую; «мои» — строкой true/false', () => {
    expect(
      errorsOf({ from: '2026-12-14', to: '2026-12-20', types: 'exam,task', mine: 'true' })
    ).toEqual([]);
    expect(
      plainToInstance(CalendarEventsQuery, {
        from: '2026-12-14',
        to: '2026-12-20',
        types: 'exam,task',
        mine: 'true'
      })
    ).toMatchObject({
      types: ['exam', 'task'],
      mine: true
    });
    expect(errorsOf({ from: '14.12.2026', to: '2026-12-20' })).toEqual(['from']);
    expect(errorsOf({ from: '2026-12-14', to: '2026-12-20', types: 'exam,lesson' })).toEqual([
      'types'
    ]);
  });
});
