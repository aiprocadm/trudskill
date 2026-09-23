import { describe, expect, it } from 'vitest';

import { PostgresTasksRepository } from './postgres-tasks.repository.js';

import type { Task } from './tasks.types.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';

interface Call {
  sql: string;
  params: unknown[];
}

/** Фейковая база: собирает SQL, отдаёт заданные строки; транзакция — тот же клиент. */
const fakeDb = (rowsBySql: Array<(sql: string) => unknown[] | undefined> = []) => {
  const calls: Call[] = [];
  let transactions = 0;
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    for (const rows of rowsBySql) {
      const out = rows(sql);
      if (out) return out;
    }
    return [];
  };
  const db = {
    query,
    withTransaction: async (cb: (client: unknown) => Promise<unknown>) => {
      transactions += 1;
      return cb({
        query: (sql: string, params?: unknown[]) => query(sql, params).then((rows) => ({ rows }))
      });
    }
  } as unknown as DatabaseService;
  return { db, calls, transactions: () => transactions };
};

const task: Task = {
  id: 'task_1',
  tenantId: 't_a',
  title: 'x',
  status: 'new',
  priority: 'normal',
  allDay: false,
  creatorUserId: 'u_1',
  links: { groupId: 'grp_1' },
  assignees: [
    { userId: 'u_1', state: 'assigned', updatedAt: '2026-10-01T00:00:00.000Z' },
    { userId: 'u_2', state: 'assigned', updatedAt: '2026-10-01T00:00:00.000Z' }
  ],
  fileIds: ['f_1'],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

const writesOf = (calls: Call[]) =>
  calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(' '));

describe('PostgresTasksRepository', () => {
  it('каждый запрос ограничен tenant_id', async () => {
    const { db, calls } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.list(
      't_a',
      { userId: 'u_1', manageAll: false },
      { filter: 'assigned_to_me', page: 1, pageSize: 50 }
    );
    await repo.getById('t_a', 'task_1');
    await repo.listComments('t_a', 'task_1');
    await repo.getComment('t_a', 'task_1', 'tcm_1');
    await repo.deleteComment('t_a', 'task_1', 'tcm_1');
    await repo.findStaffUserIds('t_a', ['u_1']);
    await repo.findExistingFileIds('t_a', ['f_1']);
    await repo.insert(task);
    await repo.update(task);

    expect(calls.length).toBeGreaterThan(8);
    for (const call of calls) expect(call.sql, call.sql).toMatch(/tenant_id/);
  });

  it('список: отбор «мне» через исполнителей, порядок с полным ключом, страница базой', async () => {
    const { db, calls } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.list(
      't_a',
      { userId: 'u_1', manageAll: false },
      { filter: 'assigned_to_me', page: 3, pageSize: 20, label: 'red' }
    );

    const sql = calls[0]!.sql;
    expect(sql).toContain('a.user_id = $2');
    expect(sql).toContain('t.label = $3');
    expect(sql).toMatch(
      /order by t\.due_at asc nulls last, t\.created_at desc, t\.id\s+limit \$4 offset \$5/
    );
    expect(calls[0]!.params).toEqual(['t_a', 'u_1', 'red', 20, 40]);
    expect(sql).toContain('count(*) over()');
  });

  it('filter=all без условий участия, overdue — только свои без manage_all', async () => {
    const { db, calls } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.list(
      't_a',
      { userId: 'u_1', manageAll: true },
      { filter: 'all', page: 1, pageSize: 50 }
    );
    await repo.list(
      't_a',
      { userId: 'u_1', manageAll: false },
      { filter: 'overdue', page: 1, pageSize: 50 }
    );

    expect(calls[0]!.sql).not.toContain('creator_user_id = $2');
    expect(calls[1]!.sql).toContain('t.creator_user_id = $2 or exists');
    expect(calls[1]!.sql).toContain("t.status in ('new', 'in_progress')");
  });

  it('entity_type подставляет колонку из белого списка', async () => {
    const { db, calls } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.list(
      't_a',
      { userId: 'u_1', manageAll: false },
      {
        filter: 'assigned_to_me',
        entityType: 'group',
        entityId: 'grp_1',
        page: 1,
        pageSize: 50
      }
    );

    expect(calls[0]!.sql).toContain('t.group_id = $3');
    expect(calls[0]!.params[2]).toBe('grp_1');
  });

  it('insert: задача, исполнители и файлы — одной транзакцией', async () => {
    const { db, calls, transactions } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.insert(task);

    expect(transactions()).toBe(1);
    expect(writesOf(calls)).toEqual([
      'insert into tasks.tasks',
      'insert into tasks.task_assignees',
      'insert into tasks.task_files'
    ]);
    expect(calls[1]!.params).toEqual([
      'task_1',
      't_a',
      'u_1',
      'assigned',
      task.assignees[0]!.updatedAt,
      'task_1',
      't_a',
      'u_2',
      'assigned',
      task.assignees[1]!.updatedAt
    ]);
    expect(calls[2]!.params).toContain('f_1');
  });

  it('update: обновляет строку и переписывает детей в той же транзакции', async () => {
    const { db, calls, transactions } = fakeDb();
    const repo = new PostgresTasksRepository(db);

    await repo.update({ ...task, assignees: [], fileIds: [] });

    expect(transactions()).toBe(1);
    expect(writesOf(calls)).toEqual([
      'update tasks.tasks set',
      'delete from tasks.task_assignees',
      'delete from tasks.task_files'
    ]);
    expect(calls[0]!.sql).toContain('where tenant_id = $2 and id = $1');
  });

  it('getById собирает исполнителей и файлы; даты — ISO', async () => {
    const { db } = fakeDb([
      (sql) =>
        sql.includes('from tasks.tasks t')
          ? [
              {
                id: 'task_1',
                tenant_id: 't_a',
                title: 'x',
                description: null,
                status: 'new',
                priority: 'high',
                label: null,
                color: null,
                starts_at: null,
                due_at: new Date('2026-10-01T10:00:00.000Z'),
                all_day: false,
                creator_user_id: 'u_1',
                counterparty_id: null,
                contact_id: null,
                group_id: 'grp_1',
                learner_id: null,
                lesson_id: null,
                reminder: { minutesBefore: 60, channels: ['push'] },
                done_at: null,
                confirmed_at: null,
                archived_at: null,
                created_at: new Date('2026-09-30T00:00:00.000Z'),
                updated_at: '2026-09-30T00:00:00.000Z'
              }
            ]
          : undefined,
      (sql) =>
        sql.includes('from tasks.task_assignees')
          ? [
              {
                task_id: 'task_1',
                user_id: 'u_2',
                state: 'in_progress',
                updated_at: new Date('2026-10-01T00:00:00.000Z')
              }
            ]
          : undefined,
      (sql) =>
        sql.includes('from tasks.task_files') ? [{ task_id: 'task_1', file_id: 'f_9' }] : undefined
    ]);
    const repo = new PostgresTasksRepository(db);

    const loaded = await repo.getById('t_a', 'task_1');

    expect(loaded).toMatchObject({
      id: 'task_1',
      priority: 'high',
      dueAt: '2026-10-01T10:00:00.000Z',
      links: { groupId: 'grp_1' },
      reminder: { minutesBefore: 60, channels: ['push'] },
      assignees: [{ userId: 'u_2', state: 'in_progress', updatedAt: '2026-10-01T00:00:00.000Z' }],
      fileIds: ['f_9'],
      createdAt: '2026-09-30T00:00:00.000Z'
    });
    expect(loaded).not.toHaveProperty('description');
  });

  it('сотрудники центра: активные пользователи с ролью не слушателя и не представителя', async () => {
    const { db, calls } = fakeDb([
      (sql) => (sql.includes('from iam.users') ? [{ id: 'u_1' }] : undefined)
    ]);
    const repo = new PostgresTasksRepository(db);

    const staff = await repo.findStaffUserIds('t_a', ['u_1', 'u_9']);

    expect(staff).toEqual(['u_1']);
    expect(calls[0]!.sql).toContain("r.code not in ('learner', 'counterparty_rep')");
    expect(calls[0]!.sql).toContain("u.status = 'active'");
    expect(await repo.findStaffUserIds('t_a', [])).toEqual([]);
  });
});
