import { apiRequest } from '../../lib/api/client';

import type { BackgroundTask, BackgroundTaskStatus } from './model';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export interface BackgroundTasksPage {
  items: BackgroundTask[];
}

export interface BackgroundTaskLabels {
  statuses: Record<BackgroundTaskStatus, string>;
  kinds: Record<string, string>;
}

/**
 * Ручки раздела «Фоновые задачи» (ТЗ 12.2).
 *
 * Подписи состояний берутся с сервера намеренно: там же ими пользуются письмо и уведомление в
 * колокольчике. Свой словарь на экране однажды разошёлся бы с ними — при том, что состояние
 * одно и то же.
 */
export const backgroundTasksApi = {
  list: (session: UserSession) =>
    apiRequest<BackgroundTasksPage>('/background-tasks', withAuth(session)),

  labels: (session: UserSession) =>
    apiRequest<BackgroundTaskLabels>('/background-tasks/labels', withAuth(session))
};
