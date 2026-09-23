'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { tasksApi } from './api';
import { useAuth } from '../auth/context';

import type {
  CreateTaskPayload,
  Task,
  TaskBulkOutcome,
  TaskTransition,
  TasksListFilters,
  UpdateTaskPayload
} from './types';

export function useTasksList(filters: TasksListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tasks-list', filters],
    enabled: Boolean(session),
    queryFn: () => tasksApi.list(session!, filters)
  });
}

export function useTaskComments(taskId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['task-comments', taskId],
    enabled: Boolean(session) && Boolean(taskId),
    queryFn: () => tasksApi.listComments(session!, taskId!)
  });
}

export function useStaffSearch(q: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tasks-staff', q],
    enabled: Boolean(session),
    queryFn: () => tasksApi.searchStaff(session!, q)
  });
}

export interface TaskMutationState {
  isPending: boolean;
  error: string | null;
}

/**
 * Мутации задач: `useState` + `await`, как везде во фронте (не `useMutation`). После успеха
 * список и комментарии перечитываются. Ошибка — словами из конверта (`TXT-004`): сервер
 * называет причину кодом, словарь ошибок переводит его человеку.
 */
export function useTaskMutations() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TaskMutationState>({ isPending: false, error: null });

  const wrap = async <T>(action: () => Promise<T>): Promise<T | null> => {
    if (!session) return null;
    setState({ isPending: true, error: null });
    try {
      const result = await action();
      setState({ isPending: false, error: null });
      await queryClient.invalidateQueries({ queryKey: ['tasks-list'] });
      await queryClient.invalidateQueries({ queryKey: ['task-comments'] });
      return result;
    } catch (error) {
      setState({
        isPending: false,
        error: error instanceof Error ? error.message : 'Не удалось выполнить действие'
      });
      return null;
    }
  };

  return {
    ...state,
    create: (payload: CreateTaskPayload): Promise<Task | null> =>
      wrap(() => tasksApi.create(session!, payload)),
    update: (taskId: string, payload: UpdateTaskPayload): Promise<Task | null> =>
      wrap(() => tasksApi.update(session!, taskId, payload)),
    transition: (
      taskId: string,
      transition: TaskTransition,
      comment?: string
    ): Promise<Task | null> =>
      wrap(() => tasksApi.transition(session!, taskId, transition, comment)),
    reschedule: (
      taskId: string,
      payload: { startsAt?: string; dueAt?: string; comment?: string }
    ): Promise<Task | null> => wrap(() => tasksApi.reschedule(session!, taskId, payload)),
    addComment: (taskId: string, text: string) =>
      wrap(() => tasksApi.addComment(session!, taskId, text)),
    bulk: (
      taskIds: string[],
      action: 'complete' | 'confirm' | 'cancel' | 'reschedule',
      payload?: { startsAt?: string; dueAt?: string; comment?: string }
    ): Promise<TaskBulkOutcome | null> =>
      wrap(() => tasksApi.bulk(session!, { taskIds, action, ...(payload ? { payload } : {}) }))
  };
}
