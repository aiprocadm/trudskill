import { describe, expect, it } from 'vitest';

import { InMemoryTasksRepository } from './in-memory-tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const TENANT = 'tenant_a';
const STAFF = { [TENANT]: ['u_author', 'u_worker', 'u_boss', 'u_other'], tenant_b: ['u_b'] };
const FILES = { [TENANT]: ['f_1', 'f_2'] };

const ctx = (
  userId: string,
  permissions: string[] = ['tasks.read', 'tasks.write']
): RequestContext =>
  ({
    tenantId: TENANT,
    userId,
    permissions,
    requestId: 'req_1',
    correlationId: 'corr_1',
    ip: '127.0.0.1',
    userAgent: 'vitest'
  }) as RequestContext;

const author = ctx('u_author');
const worker = ctx('u_worker');
const boss = ctx('u_boss', ['tasks.read', 'tasks.write', 'tasks.manage_all']);
const other = ctx('u_other');

const makeService = (clock?: () => Date) => {
  const audit = new AuditService();
  const repo = new InMemoryTasksRepository(STAFF, FILES);
  const service = new TasksService(repo, audit, { commentDeleteWindowMinutes: 15 }, clock);
  return { service, audit, repo };
};

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'no_error';
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { code?: string })?.code ?? 'unknown';
  }
};

describe('TasksService — создание (§5.4 МГ-G2.1)', () => {
  it('исполнитель по умолчанию — сам постановщик; статус new; аудит tasks.task_created', async () => {
    const { service, audit } = makeService();

    const task = await service.create(TENANT, author, { title: '  Позвонить заказчику ' });

    expect(task.title).toBe('Позвонить заказчику');
    expect(task.status).toBe('new');
    expect(task.creatorUserId).toBe('u_author');
    expect(task.assignees.map((a) => a.userId)).toEqual(['u_author']);
    expect(task.priority).toBe('normal');
    expect((await audit.list(TENANT)).map((r) => r.action)).toEqual(['tasks.task_created']);
  });

  it('исполнитель не сотрудник центра → 400 task_assignee_not_staff', async () => {
    const { service } = makeService();

    expect(
      await codeOf(service.create(TENANT, author, { title: 'x', assigneeIds: ['u_worker', 'u_b'] }))
    ).toBe('task_assignee_not_staff');
  });

  it('срок раньше начала → 400 validation_error; неизвестный файл → 404 file_not_found', async () => {
    const { service } = makeService();

    expect(
      await codeOf(
        service.create(TENANT, author, {
          title: 'x',
          startsAt: '2026-10-02T10:00:00.000Z',
          dueAt: '2026-10-01T10:00:00.000Z'
        })
      )
    ).toBe('validation_error');
    expect(await codeOf(service.create(TENANT, author, { title: 'x', fileIds: ['f_nope'] }))).toBe(
      'file_not_found'
    );
  });

  it('дубли исполнителей и файлов схлопываются, ссылки без пустых значений', async () => {
    const { service } = makeService();

    const task = await service.create(TENANT, author, {
      title: 'x',
      assigneeIds: ['u_worker', 'u_worker', ' u_boss '],
      fileIds: ['f_1', 'f_1'],
      links: { groupId: 'grp_1', learnerId: '' }
    });

    expect(task.assignees.map((a) => a.userId)).toEqual(['u_worker', 'u_boss']);
    expect(task.fileIds).toEqual(['f_1']);
    expect(task.links).toEqual({ groupId: 'grp_1' });
  });
});

describe('TasksService — видимость и реестр (§16)', () => {
  it('чужая задача без manage_all — 404 task_not_found; с manage_all — видна', async () => {
    const { service } = makeService();
    const task = await service.create(TENANT, author, { title: 'x', assigneeIds: ['u_worker'] });

    expect(await codeOf(service.get(TENANT, other, task.id))).toBe('task_not_found');
    await expect(service.get(TENANT, worker, task.id)).resolves.toMatchObject({ id: task.id });
    await expect(service.get(TENANT, boss, task.id)).resolves.toMatchObject({ id: task.id });
  });

  it('filter=all и assignee= без manage_all — 403 task_filter_all_forbidden', async () => {
    const { service } = makeService();
    const base = { page: 1, pageSize: 50 } as const;

    expect(await codeOf(service.list(TENANT, author, { ...base, filter: 'all' }))).toBe(
      'task_filter_all_forbidden'
    );
    expect(
      await codeOf(
        service.list(TENANT, author, { ...base, filter: 'assigned_to_me', assignee: 'u_worker' })
      )
    ).toBe('task_filter_all_forbidden');
    await expect(service.list(TENANT, boss, { ...base, filter: 'all' })).resolves.toMatchObject({
      total: 0
    });
  });

  it('assigned_to_me / created_by_me / overdue / done отбирают по участию', async () => {
    const { service } = makeService();
    const mine = await service.create(TENANT, author, {
      title: 'мне',
      assigneeIds: ['u_worker'],
      // срок в прошлом — «просрочена» считается от настоящего времени, как в базе (`now()`)
      dueAt: '2025-01-01T00:00:00.000Z'
    });
    await service.create(TENANT, other, { title: 'чужая', assigneeIds: ['u_other'] });
    const base = { page: 1, pageSize: 50 } as const;

    const assigned = await service.list(TENANT, worker, { ...base, filter: 'assigned_to_me' });
    const created = await service.list(TENANT, author, { ...base, filter: 'created_by_me' });
    const overdue = await service.list(TENANT, worker, { ...base, filter: 'overdue' });
    const done = await service.list(TENANT, worker, { ...base, filter: 'done' });

    expect(assigned.items.map((t) => t.id)).toEqual([mine.id]);
    expect(created.items.map((t) => t.id)).toEqual([mine.id]);
    expect(overdue.items.map((t) => t.id)).toEqual([mine.id]);
    expect(done.total).toBe(0);
  });
});

describe('TasksService — переходы (§5.4 МГ-G2.2)', () => {
  const setup = async () => {
    const built = makeService();
    const task = await built.service.create(TENANT, author, {
      title: 'x',
      assigneeIds: ['u_worker']
    });
    return { ...built, task };
  };

  it('исполнитель: start → in_progress, complete → done (с doneAt); постановщик: confirm → confirmed', async () => {
    const { service, task, audit } = await setup();

    const started = await service.transition(TENANT, worker, task.id, 'start');
    expect(started.status).toBe('in_progress');
    expect(started.assignees[0]?.state).toBe('in_progress');

    const done = await service.transition(TENANT, worker, task.id, 'complete');
    expect(done.status).toBe('done');
    expect(done.doneAt).toBeTruthy();
    expect(done.assignees[0]?.state).toBe('done');

    const confirmed = await service.transition(TENANT, author, task.id, 'confirm');
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedAt).toBeTruthy();
    expect(
      (await audit.list(TENANT)).filter((r) => r.action === 'tasks.task_status_changed')
    ).toHaveLength(3);
  });

  it('постановщик не может «взять в работу», исполнитель — «подтвердить»: 403 task_action_forbidden', async () => {
    const { service, task } = await setup();

    expect(await codeOf(service.transition(TENANT, author, task.id, 'start'))).toBe(
      'task_action_forbidden'
    );
    await service.transition(TENANT, worker, task.id, 'start');
    await service.transition(TENANT, worker, task.id, 'complete');
    expect(await codeOf(service.transition(TENANT, worker, task.id, 'confirm'))).toBe(
      'task_action_forbidden'
    );
  });

  it('недопустимый переход — 409 task_status_transition_invalid', async () => {
    const { service, task } = await setup();

    expect(await codeOf(service.transition(TENANT, worker, task.id, 'complete'))).toBe(
      'task_status_transition_invalid'
    );
    expect(await codeOf(service.transition(TENANT, author, task.id, 'confirm'))).toBe(
      'task_status_transition_invalid'
    );
  });

  it('return без комментария — 400; с комментарием → in_progress и комментарий записан', async () => {
    const { service, task } = await setup();
    await service.transition(TENANT, worker, task.id, 'start');
    await service.transition(TENANT, worker, task.id, 'complete');

    expect(await codeOf(service.transition(TENANT, author, task.id, 'return'))).toBe(
      'validation_error'
    );
    const returned = await service.transition(TENANT, author, task.id, 'return', 'Не хватает акта');
    expect(returned.status).toBe('in_progress');
    expect(returned.assignees[0]?.state).toBe('in_progress');
    const comments = await service.listComments(TENANT, worker, task.id);
    expect(comments.map((c) => c.text)).toEqual(['Не хватает акта']);
  });

  it('cancel — постановщик или manage_all; из confirmed — уже нельзя', async () => {
    const { service, task } = await setup();

    expect(await codeOf(service.transition(TENANT, worker, task.id, 'cancel'))).toBe(
      'task_action_forbidden'
    );
    const cancelled = await service.transition(TENANT, boss, task.id, 'cancel');
    expect(cancelled.status).toBe('cancelled');
    expect(await codeOf(service.transition(TENANT, author, task.id, 'cancel'))).toBe(
      'task_status_transition_invalid'
    );
  });
});

describe('TasksService — правка и перенос', () => {
  it('править может постановщик или manage_all; чужой — 403 task_edit_forbidden; после отмены — 409', async () => {
    const { service } = makeService();
    const task = await service.create(TENANT, author, { title: 'x', assigneeIds: ['u_worker'] });

    expect(await codeOf(service.update(TENANT, worker, task.id, { title: 'y' }))).toBe(
      'task_edit_forbidden'
    );
    const updated = await service.update(TENANT, boss, task.id, {
      title: 'y',
      assigneeIds: ['u_worker', 'u_other'],
      priority: 'high'
    });
    expect(updated.title).toBe('y');
    expect(updated.priority).toBe('high');
    expect(updated.assignees.map((a) => a.userId)).toEqual(['u_worker', 'u_other']);

    await service.transition(TENANT, author, task.id, 'cancel');
    expect(await codeOf(service.update(TENANT, author, task.id, { title: 'z' }))).toBe(
      'task_not_editable'
    );
  });

  it('перенос: чужому — 403 task_reschedule_forbidden; due < start — 400; с комментарием пишет его', async () => {
    const { service } = makeService();
    const task = await service.create(TENANT, author, {
      title: 'x',
      assigneeIds: ['u_worker'],
      startsAt: '2026-10-01T09:00:00.000Z',
      dueAt: '2026-10-01T18:00:00.000Z'
    });

    expect(
      await codeOf(
        service.reschedule(TENANT, worker, task.id, { dueAt: '2026-10-02T18:00:00.000Z' })
      )
    ).toBe('task_reschedule_forbidden');
    expect(
      await codeOf(
        service.reschedule(TENANT, author, task.id, { dueAt: '2026-09-30T18:00:00.000Z' })
      )
    ).toBe('validation_error');
    const moved = await service.reschedule(TENANT, author, task.id, {
      dueAt: '2026-10-03T18:00:00.000Z',
      comment: 'Заказчик попросил позже'
    });
    expect(moved.dueAt).toBe('2026-10-03T18:00:00.000Z');
    expect((await service.listComments(TENANT, author, task.id)).map((c) => c.text)).toEqual([
      'Заказчик попросил позже'
    ]);
  });
});

describe('TasksService — комментарии (§4)', () => {
  it('свой комментарий удаляется в окне 15 минут, чужой и просроченный — 403', async () => {
    let now = new Date('2026-10-01T10:00:00.000Z');
    const { service } = makeService(() => now);
    const task = await service.create(TENANT, author, { title: 'x', assigneeIds: ['u_worker'] });
    const comment = await service.addComment(TENANT, worker, task.id, {
      text: 'Готово наполовину'
    });

    expect(await codeOf(service.deleteComment(TENANT, author, task.id, comment.id))).toBe(
      'task_comment_delete_forbidden'
    );
    now = new Date('2026-10-01T10:16:00.000Z');
    expect(await codeOf(service.deleteComment(TENANT, worker, task.id, comment.id))).toBe(
      'task_comment_delete_forbidden'
    );
    now = new Date('2026-10-01T10:10:00.000Z');
    await service.deleteComment(TENANT, worker, task.id, comment.id);
    expect(await service.listComments(TENANT, worker, task.id)).toEqual([]);
    expect(await codeOf(service.deleteComment(TENANT, worker, task.id, comment.id))).toBe(
      'task_comment_not_found'
    );
  });

  it('комментировать чужую задачу без участия нельзя — 404 task_not_found', async () => {
    const { service } = makeService();
    const task = await service.create(TENANT, author, { title: 'x' });

    expect(await codeOf(service.addComment(TENANT, other, task.id, { text: 'привет' }))).toBe(
      'task_not_found'
    );
  });
});

describe('TasksService — массовая операция (§16, частичный успех)', () => {
  it('одна упавшая строка не отменяет остальные; отказ поимённо с кодом', async () => {
    const { service } = makeService();
    const a = await service.create(TENANT, author, { title: 'a' });
    const b = await service.create(TENANT, author, { title: 'b' });
    await service.transition(TENANT, author, b.id, 'cancel');

    const outcome = await service.bulk(TENANT, author, {
      taskIds: [a.id, b.id, 'task_missing'],
      action: 'cancel'
    });

    expect(outcome).toMatchObject({ total: 3, done: 1, failed: 2 });
    expect(outcome.rows[0]).toEqual({ taskId: a.id, status: 'done' });
    expect(outcome.rows[1]?.error?.code).toBe('task_status_transition_invalid');
    expect(outcome.rows[2]?.error?.code).toBe('task_not_found');
  });

  it('reschedule массово переносит срок постановщика', async () => {
    const { service } = makeService();
    const a = await service.create(TENANT, author, {
      title: 'a',
      dueAt: '2026-10-01T00:00:00.000Z'
    });

    const outcome = await service.bulk(TENANT, author, {
      taskIds: [a.id],
      action: 'reschedule',
      payload: { dueAt: '2026-10-05T00:00:00.000Z' }
    });

    expect(outcome.done).toBe(1);
    expect((await service.get(TENANT, author, a.id)).dueAt).toBe('2026-10-05T00:00:00.000Z');
  });
});
