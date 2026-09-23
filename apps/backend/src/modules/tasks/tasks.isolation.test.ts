import { describe, expect, it } from 'vitest';

import { InMemoryTasksRepository } from './in-memory-tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Изоляция центров для задач (ТЗ перехода с CDOPROF §13.4 «изоляция тенантов для новых
 * таблиц»): запись центра Б недостижима из центра А ни одной ручкой — и отвечает 404, а не 403,
 * даже администратору с `tasks.manage_all`: чужой центр не должен узнать, что задача есть.
 */
const ctx = (tenantId: string, userId: string, permissions: string[]): RequestContext =>
  ({ tenantId, userId, permissions, requestId: 'r', correlationId: 'c' }) as RequestContext;

describe('tasks — изоляция центров', () => {
  it('задача центра Б не видна из центра А ни чтением, ни правкой, ни переходом, ни комментарием', async () => {
    const repo = new InMemoryTasksRepository({ t_a: ['u_a'], t_b: ['u_b'] });
    const service = new TasksService(repo, new AuditService());
    const bossA = ctx('t_a', 'u_a', ['tasks.read', 'tasks.write', 'tasks.manage_all']);
    const userB = ctx('t_b', 'u_b', ['tasks.read', 'tasks.write']);
    const task = await service.create('t_b', userB, { title: 'секрет центра Б' });

    const codes = await Promise.all(
      [
        service.get('t_a', bossA, task.id),
        service.update('t_a', bossA, task.id, { title: 'взлом' }),
        service.transition('t_a', bossA, task.id, 'cancel'),
        service.reschedule('t_a', bossA, task.id, { dueAt: '2026-10-01T00:00:00.000Z' }),
        service.listComments('t_a', bossA, task.id),
        service.addComment('t_a', bossA, task.id, { text: 'x' }),
        service.deleteComment('t_a', bossA, task.id, 'tcm_x')
      ].map((p) =>
        p.then(
          () => 'no_error',
          (e: { getResponse?: () => unknown }) => (e.getResponse?.() as { code?: string })?.code
        )
      )
    );

    expect(codes).toEqual(Array(7).fill('task_not_found'));
    const all = await service.list('t_a', bossA, { filter: 'all', page: 1, pageSize: 50 });
    expect(all.total).toBe(0);
    expect((await service.get('t_b', userB, task.id)).title).toBe('секрет центра Б');
  });

  it('исполнитель из другого центра не назначается', async () => {
    const repo = new InMemoryTasksRepository({ t_a: ['u_a'], t_b: ['u_b'] });
    const service = new TasksService(repo, new AuditService());

    await expect(
      service.create('t_a', ctx('t_a', 'u_a', ['tasks.write']), {
        title: 'x',
        assigneeIds: ['u_b']
      })
    ).rejects.toMatchObject({ response: { code: 'task_assignee_not_staff' } });
  });
});
