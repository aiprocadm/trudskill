'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { type RequestOptions, apiRequest } from '../../lib/api/client';
import { realtimeClient } from '../../lib/realtime/client';
import { useAuth } from '../auth/context';

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

export const useNotificationsRealtime = (onRefresh: () => void) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!session) return;
    const room = `user:${session.user.id}`;
    return realtimeClient.subscribe(room, session.tokens.accessToken, () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onRefresh();
    });
  }, [onRefresh, queryClient, session]);
};

export const useTaskRealtime = (taskId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useEffect(() => {
    if (!session || !taskId) return;
    return realtimeClient.subscribe(
      `task:${session.user.tenantId}:${taskId}`,
      session.tokens.accessToken,
      () => onRefresh()
    );
  }, [onRefresh, session, taskId]);
};

export const useChatRealtime = (dialogId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useEffect(() => {
    if (!session || !dialogId) return;
    return realtimeClient.subscribe(
      `dialog:${session.user.tenantId}:${dialogId}`,
      session.tokens.accessToken,
      () => onRefresh()
    );
  }, [dialogId, onRefresh, session]);
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
