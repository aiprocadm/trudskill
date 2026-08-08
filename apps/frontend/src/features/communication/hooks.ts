'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type RequestOptions, apiRequest } from '../../lib/api/client';
import { realtimeClient } from '../../lib/realtime/client';
import { useAuth } from '../auth/context';

import type { RealtimeEventEnvelope } from '@trudskill/api-contracts';

export interface NotificationDto {
  id: string;
  subjectText: string;
  bodyText: string;
  status: string;
  createdAt: string;
}
interface DialogDto {
  id: string;
  title: string;
}
interface MessageDto {
  id: string;
  textBody: string;
  authorUserId: string;
  createdAt: string;
}

interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const authHeaders = (session: ReturnType<typeof useAuth>['session']): RequestOptions => {
  if (!session) return {};

  return {
    auth: {
      userId: session.user.id,
      tenantId: session.user.tenantId,
      accessToken: session.tokens.accessToken
    }
  };
};

/**
 * Тело эффекта живой подписки, вынесенное из хука.
 *
 * Наружу торчит ради теста: React-рендерера в проекте нет, а проверить нужно
 * главное — колбэк берётся из ref в момент события, поэтому его пересоздание
 * на рендере не требует переподписки.
 */
export const openRealtimeSubscription = (
  room: string | null,
  token: string | null,
  callbackRef: { current: (event: RealtimeEventEnvelope) => void }
) => {
  if (!room || !token) return undefined;
  return realtimeClient.subscribe(room, token, (event) => callbackRef.current(event));
};

/*
 * Колбэки экранов — новая стрелка на каждый рендер. Держать их в зависимостях
 * эффекта нельзя: подписка пересобиралась бы после каждой перерисовки, а
 * перерисовку вызывает само событие — получался самоподдерживающийся круг
 * (Фаза 6, дефект A: шторм realtime). Последняя версия колбэка живёт в ref, а
 * эффект зависит только от того, что реально определяет соединение: комната и
 * токен. Приём тот же, что в test-attempt-screen.tsx (handleSubmitRef).
 */
const useRealtimeRoom = (
  room: string | null,
  token: string | null,
  onEvent: (event: RealtimeEventEnvelope) => void
) => {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => openRealtimeSubscription(room, token, callbackRef), [room, token]);
};

/**
 * `onRefresh` нужен только тем экранам, которые тянут уведомления мимо ключа
 * `['notifications']`: этот ключ хук и так сбрасывает сам. Кто читает через
 * `useNotificationsList`, колбэк не передаёт — иначе на каждое событие уходило
 * бы по два одинаковых запроса.
 */
export const useNotificationsRealtime = (onRefresh?: () => void) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  useRealtimeRoom(
    session ? `user:${session.user.id}` : null,
    session?.tokens.accessToken ?? null,
    () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onRefresh?.();
    }
  );
};

export const useTaskRealtime = (taskId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useRealtimeRoom(
    session && taskId ? `task:${session.user.tenantId}:${taskId}` : null,
    session?.tokens.accessToken ?? null,
    () => onRefresh()
  );
};

export const useChatRealtime = (dialogId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useRealtimeRoom(
    session && dialogId ? `dialog:${session.user.tenantId}:${dialogId}` : null,
    session?.tokens.accessToken ?? null,
    () => onRefresh()
  );
};

export const useNotificationsList = (page = 1, pageSize = 20, filter = '') => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['notifications', page, pageSize, filter],
    enabled: Boolean(session),
    queryFn: () =>
      communicationApi.listNotifications(session, { page, page_size: pageSize, filter })
  });

  return {
    data: query.data,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

export const communicationApi = {
  listNotifications: (
    session: ReturnType<typeof useAuth>['session'],
    query?: { page?: number; page_size?: number; filter?: string }
  ) =>
    apiRequest<ListResponse<NotificationDto>>(
      `/notifications?page=${query?.page ?? 1}&page_size=${query?.page_size ?? 20}&filter=${query?.filter ?? ''}`,
      authHeaders(session)
    ),
  unreadCounter: (session: ReturnType<typeof useAuth>['session']) =>
    apiRequest<{ count: number }>('/notifications/unread-counter', authHeaders(session)),
  markRead: (session: ReturnType<typeof useAuth>['session'], id: string) =>
    apiRequest(`/notifications/${id}/read`, { method: 'POST', ...authHeaders(session) }),
  markAllRead: (session: ReturnType<typeof useAuth>['session']) =>
    apiRequest('/notifications/read-all', { method: 'POST', ...authHeaders(session) }),
  listDialogs: (session: ReturnType<typeof useAuth>['session']) =>
    apiRequest<DialogDto[]>('/chat/dialogs', authHeaders(session)),
  createDialog: (
    session: ReturnType<typeof useAuth>['session'],
    body: { participantUserId: string; title: string }
  ) => apiRequest('/chat/dialogs', { method: 'POST', body, ...authHeaders(session) }),
  listMessages: (session: ReturnType<typeof useAuth>['session'], dialogId: string) =>
    apiRequest<MessageDto[]>(`/chat/dialogs/${dialogId}/messages`, authHeaders(session)),
  postMessage: (
    session: ReturnType<typeof useAuth>['session'],
    dialogId: string,
    textBody: string
  ) =>
    apiRequest(`/chat/dialogs/${dialogId}/messages`, {
      method: 'POST',
      body: { textBody },
      ...authHeaders(session)
    })
};
