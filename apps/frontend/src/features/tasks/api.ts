import { apiRequest } from '../../lib/api/client';

import type {
  CreateTaskPayload,
  StaffMember,
  Task,
  TaskBulkOutcome,
  TaskComment,
  TaskTransition,
  TasksListFilters,
  TasksListResponse,
  UpdateTaskPayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

/**
 * Ручки §16 ТЗ перехода с CDOPROF. Параметры списка — как их читает сервер (`filter`, `assignee`,
 * `due_from`, `due_to`, `label`, `page`, `page_size`): каждый фильтр экрана доходит до базы.
 */
export const tasksApi = {
  list: (session: UserSession, filters: TasksListFilters): Promise<TasksListResponse> => {
    const params = new URLSearchParams();
    params.set('filter', filters.filter);
    if (filters.assignee) params.set('assignee', filters.assignee);
    if (filters.dueFrom) params.set('due_from', filters.dueFrom);
    if (filters.dueTo) params.set('due_to', filters.dueTo);
    if (filters.label) params.set('label', filters.label);
    params.set('page', String(filters.page));
    params.set('page_size', String(filters.pageSize));
    return apiRequest<TasksListResponse>(`/tasks?${params.toString()}`, {
      method: 'GET',
      ...withAuth(session)
    });
  },

  get: (session: UserSession, taskId: string): Promise<Task> =>
    apiRequest<Task>(`/tasks/${taskId}`, { method: 'GET', ...withAuth(session) }),

  create: (session: UserSession, payload: CreateTaskPayload): Promise<Task> =>
    apiRequest<Task>('/tasks', { method: 'POST', body: payload, ...withAuth(session) }),

  update: (session: UserSession, taskId: string, payload: UpdateTaskPayload): Promise<Task> =>
    apiRequest<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: payload, ...withAuth(session) }),

  transition: (
    session: UserSession,
    taskId: string,
    transition: TaskTransition,
    comment?: string
  ): Promise<Task> =>
    apiRequest<Task>(`/tasks/${taskId}/${transition}`, {
      method: 'POST',
      body: comment ? { comment } : {},
      ...withAuth(session)
    }),

  reschedule: (
    session: UserSession,
    taskId: string,
    payload: { startsAt?: string; dueAt?: string; comment?: string }
  ): Promise<Task> =>
    apiRequest<Task>(`/tasks/${taskId}/reschedule`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listComments: (session: UserSession, taskId: string): Promise<{ items: TaskComment[] }> =>
    apiRequest<{ items: TaskComment[] }>(`/tasks/${taskId}/comments`, {
      method: 'GET',
      ...withAuth(session)
    }),

  addComment: (session: UserSession, taskId: string, text: string): Promise<TaskComment> =>
    apiRequest<TaskComment>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: { text },
      ...withAuth(session)
    }),

  bulk: (
    session: UserSession,
    payload: {
      taskIds: string[];
      action: 'complete' | 'confirm' | 'cancel' | 'reschedule';
      payload?: { startsAt?: string; dueAt?: string; comment?: string };
    }
  ): Promise<TaskBulkOutcome> =>
    apiRequest<TaskBulkOutcome>('/tasks/bulk', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  /** Сотрудники центра для выбора исполнителя — с ФИО, без прав администратора. */
  searchStaff: (session: UserSession, q: string): Promise<{ items: StaffMember[] }> => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    return apiRequest<{ items: StaffMember[] }>(qs ? `/tasks/staff?${qs}` : '/tasks/staff', {
      method: 'GET',
      ...withAuth(session)
    });
  }
};
