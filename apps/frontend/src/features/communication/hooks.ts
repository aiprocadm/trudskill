'use client';

import { useEffect } from 'react';
import { apiRequest } from '../../lib/api/client';
import { realtimeClient } from '../../lib/realtime/client';
import { useAuth } from '../auth/context';

const authHeaders = (session: ReturnType<typeof useAuth>['session']) => ({
  auth: session
    ? { userId: session.user.id, tenantId: session.user.tenantId, accessToken: session.tokens.accessToken }
    : undefined
});

export const useNotificationsRealtime = (onRefresh: () => void) => {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    const room = `user:${session.user.id}`;
    const token = `${session.user.tenantId}|${session.user.id}|${session.roles.join(',')}`;
    return realtimeClient.subscribe(room, token, () => onRefresh());
  }, [onRefresh, session]);
};

export const useTaskRealtime = (taskId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useEffect(() => {
    if (!session || !taskId) return;
    const token = `${session.user.tenantId}|${session.user.id}|${session.roles.join(',')}`;
    return realtimeClient.subscribe(`task:${taskId}`, token, () => onRefresh());
  }, [onRefresh, session, taskId]);
};

export const useChatRealtime = (dialogId: string | undefined, onRefresh: () => void) => {
  const { session } = useAuth();
  useEffect(() => {
    if (!session || !dialogId) return;
    const token = `${session.user.tenantId}|${session.user.id}|${session.roles.join(',')}`;
    return realtimeClient.subscribe(`dialog:${dialogId}`, token, () => onRefresh());
  }, [dialogId, onRefresh, session]);
};

export const communicationApi = {
  listNotifications: (session: ReturnType<typeof useAuth>['session']) => apiRequest<any[]>('/notifications', authHeaders(session)),
  unreadCounter: (session: ReturnType<typeof useAuth>['session']) => apiRequest<{ count: number }>('/notifications/unread-counter', authHeaders(session)),
  markRead: (session: ReturnType<typeof useAuth>['session'], id: string) => apiRequest(`/notifications/${id}/read`, { method: 'POST', ...authHeaders(session) }),
  markAllRead: (session: ReturnType<typeof useAuth>['session']) => apiRequest('/notifications/read-all', { method: 'POST', ...authHeaders(session) }),
  listDialogs: (session: ReturnType<typeof useAuth>['session']) => apiRequest<any[]>('/chat/dialogs', authHeaders(session)),
  createDialog: (session: ReturnType<typeof useAuth>['session'], body: any) => apiRequest('/chat/dialogs', { method: 'POST', body, ...authHeaders(session) }),
  listMessages: (session: ReturnType<typeof useAuth>['session'], dialogId: string) => apiRequest<any[]>(`/chat/dialogs/${dialogId}/messages`, authHeaders(session)),
  postMessage: (session: ReturnType<typeof useAuth>['session'], dialogId: string, textBody: string) => apiRequest(`/chat/dialogs/${dialogId}/messages`, { method: 'POST', body: { textBody }, ...authHeaders(session) })
};
