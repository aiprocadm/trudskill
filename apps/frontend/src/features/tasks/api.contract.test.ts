import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { tasksApi as TasksApi } from './api';
import type { UserSession } from '../../entities/session/model';

const envelope = (data: unknown) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req_1', correlationId: 'corr_1', timestamp: '2026-09-23T00:00:00.000Z' }
  });

const session = {
  user: { id: 'u_1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token' }
} as unknown as UserSession;

const TASK = {
  id: 'task_1',
  tenantId: 'tenant_demo',
  title: 'Позвонить заказчику',
  status: 'new',
  priority: 'normal',
  allDay: false,
  creatorUserId: 'u_1',
  creatorName: 'Иванова Анна',
  links: {},
  assignees: [
    { userId: 'u_2', name: 'Петров Пётр', state: 'assigned', updatedAt: '2026-09-23T00:00:00.000Z' }
  ],
  fileIds: [],
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z'
};

describe('tasksApi — контракт §16', () => {
  const fetchMock = vi.fn();
  let api: typeof TasksApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    api = (await import('./api')).tasksApi;
  });
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list: все фильтры экрана уходят на сервер под его именами, ответ разворачивается из конверта', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [TASK], page: 2, pageSize: 50, total: 51 }), { status: 200 })
    );

    const result = await api.list(session, {
      filter: 'overdue',
      assignee: 'u_2',
      dueFrom: '2026-09-01T00:00:00.000Z',
      dueTo: '2026-09-30T23:59:59.999Z',
      label: 'документы',
      page: 2,
      pageSize: 50
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/tasks?');
    for (const part of [
      'filter=overdue',
      'assignee=u_2',
      'due_from=2026-09-01',
      'due_to=2026-09-30',
      'label=',
      'page=2',
      'page_size=50'
    ]) {
      expect(url, part).toContain(part);
    }
    expect(result.total).toBe(51);
    expect(result.items[0]?.assignees[0]?.name).toBe('Петров Пётр');
  });

  it('transition и comments: POST на нужный путь с телом', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ ...TASK, status: 'in_progress' }), { status: 201 })
    );
    const started = await api.transition(session, 'task_1', 'start');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/tasks/task_1/start');
    expect(started.status).toBe('in_progress');

    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ ...TASK, status: 'in_progress' }), { status: 201 })
    );
    await api.transition(session, 'task_1', 'return', 'Не хватает акта');
    const returnInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(String(returnInit.body)).toContain('Не хватает акта');

    fetchMock.mockResolvedValueOnce(new Response(envelope({ items: [] }), { status: 200 }));
    const comments = await api.listComments(session, 'task_1');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/tasks/task_1/comments');
    expect(comments.items).toEqual([]);
  });

  it('bulk и searchStaff: массовое действие и поиск сотрудников', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          total: 2,
          done: 1,
          failed: 1,
          rows: [
            { taskId: 'task_1', status: 'done' },
            {
              taskId: 'task_2',
              status: 'failed',
              error: { code: 'task_not_found', message: 'Задача не найдена' }
            }
          ]
        }),
        { status: 201 }
      )
    );
    const outcome = await api.bulk(session, { taskIds: ['task_1', 'task_2'], action: 'complete' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/tasks/bulk');
    expect(outcome.failed).toBe(1);

    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'u_2', name: 'Петров Пётр' }] }), { status: 200 })
    );
    const staff = await api.searchStaff(session, 'Петр');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/tasks/staff?q=');
    expect(staff.items[0]?.name).toBe('Петров Пётр');
  });
});
