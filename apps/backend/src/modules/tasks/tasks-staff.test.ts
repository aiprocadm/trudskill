import { describe, expect, it } from 'vitest';

import { InMemoryTasksRepository } from './in-memory-tasks.repository.js';
import { PostgresTasksRepository } from './postgres-tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Люди в задачах — по имени (позиция 6, `id-output-ban` фронта): исполнители, постановщик и
 * автор комментария приходят с ФИО из `iam.users.display_name`; выбор исполнителя — поиском
 * по ФИО среди активных сотрудников центра под `tasks.write`.
 */
const ctx = (userId: string): RequestContext =>
  ({
    tenantId: 't_a',
    userId,
    permissions: ['tasks.read', 'tasks.write'],
    requestId: 'r',
    correlationId: 'c'
  }) as RequestContext;

describe('TasksService.searchStaff и имена участников (in-memory)', () => {
  const repo = new InMemoryTasksRepository({
    t_a: [
      { id: 'u_1', name: 'Иванова Анна' },
      { id: 'u_2', name: 'Петров Пётр' },
      { id: 'u_3', name: 'Петрова Мария' }
    ],
    t_b: [{ id: 'u_9', name: 'Чужой Сотрудник' }]
  });
  const service = new TasksService(repo, new AuditService());

  it('ищет по части ФИО без учёта регистра, по алфавиту, только в своём центре', async () => {
    const found = await service.searchStaff('t_a', 'петр');

    expect(found.map((m) => m.name)).toEqual(['Петров Пётр', 'Петрова Мария']);
    expect(await service.searchStaff('t_a', 'чужой')).toEqual([]);
    expect((await service.searchStaff('t_a', '')).map((m) => m.id)).toEqual(['u_1', 'u_2', 'u_3']);
  });

  it('задача приходит с именами постановщика и исполнителей', async () => {
    const task = await service.create('t_a', ctx('u_1'), { title: 'x', assigneeIds: ['u_2'] });

    const loaded = await service.get('t_a', ctx('u_1'), task.id);
    expect(loaded.creatorName).toBe('Иванова Анна');
    expect(loaded.assignees[0]).toMatchObject({ userId: 'u_2', name: 'Петров Пётр' });
    const page = await service.list('t_a', ctx('u_2'), {
      filter: 'assigned_to_me',
      page: 1,
      pageSize: 50
    });
    expect(page.items[0]?.assignees[0]?.name).toBe('Петров Пётр');
  });
});

describe('PostgresTasksRepository — имена и поиск сотрудников', () => {
  const fakeDb = (answer: (sql: string) => unknown[] | undefined) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return answer(sql) ?? [];
      },
      withTransaction: async (cb: (client: unknown) => Promise<unknown>) =>
        cb({ query: async () => ({ rows: [] }) })
    } as unknown as DatabaseService;
    return { db, calls };
  };

  it('searchStaff: только активные сотрудники центра, по алфавиту, с пределом', async () => {
    const { db, calls } = fakeDb((sql) =>
      sql.includes('from iam.users u') ? [{ id: 'u_2', display_name: 'Петров Пётр' }] : undefined
    );

    const found = await new PostgresTasksRepository(db).searchStaff('t_a', 'петр', 20);

    expect(found).toEqual([{ id: 'u_2', name: 'Петров Пётр' }]);
    const sql = calls[0]!.sql;
    expect(sql).toContain('u.tenant_id = $1');
    expect(sql).toContain("u.status = 'active'");
    expect(sql).toContain("r.code not in ('learner', 'counterparty_rep')");
    expect(sql).toContain('order by u.display_name, u.id');
    expect(calls[0]!.params).toEqual(['t_a', 'петр', 20]);
  });

  it('getById подтягивает имена постановщика и исполнителей одним запросом к iam.users', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (sql.includes('from tasks.tasks t')) {
        return [
          {
            id: 'task_1',
            tenant_id: 't_a',
            title: 'x',
            description: null,
            status: 'new',
            priority: 'normal',
            label: null,
            color: null,
            starts_at: null,
            due_at: null,
            all_day: false,
            creator_user_id: 'u_1',
            counterparty_id: null,
            contact_id: null,
            group_id: null,
            learner_id: null,
            lesson_id: null,
            reminder: null,
            done_at: null,
            confirmed_at: null,
            archived_at: null,
            created_at: '2026-09-23T00:00:00.000Z',
            updated_at: '2026-09-23T00:00:00.000Z'
          }
        ];
      }
      if (sql.includes('from tasks.task_assignees')) {
        return [
          {
            task_id: 'task_1',
            user_id: 'u_2',
            state: 'assigned',
            updated_at: '2026-09-23T00:00:00.000Z'
          }
        ];
      }
      if (sql.includes('select id, display_name from iam.users')) {
        return [
          { id: 'u_1', display_name: 'Иванова Анна' },
          { id: 'u_2', display_name: 'Петров Пётр' }
        ];
      }
      return undefined;
    });

    const task = await new PostgresTasksRepository(db).getById('t_a', 'task_1');

    expect(task?.creatorName).toBe('Иванова Анна');
    expect(task?.assignees[0]?.name).toBe('Петров Пётр');
    const namesCall = calls.find((c) => c.sql.includes('select id, display_name from iam.users'));
    expect(namesCall?.sql).toContain('tenant_id = $1');
    expect(namesCall?.params).toEqual(['t_a', ['u_1', 'u_2']]);
  });

  it('комментарии приходят с именем автора через соединение с iam.users по центру', async () => {
    const { db, calls } = fakeDb((sql) =>
      sql.includes('from tasks.task_comments c')
        ? [
            {
              id: 'tcm_1',
              tenant_id: 't_a',
              task_id: 'task_1',
              author_user_id: 'u_2',
              author_name: 'Петров Пётр',
              text: 'ок',
              created_at: '2026-09-23T00:00:00.000Z',
              file_id: null
            }
          ]
        : undefined
    );

    const comments = await new PostgresTasksRepository(db).listComments('t_a', 'task_1');

    expect(comments[0]?.authorName).toBe('Петров Пётр');
    expect(calls[0]!.sql).toContain(
      'left join iam.users u on u.id = c.author_user_id and u.tenant_id = c.tenant_id'
    );
  });
});
