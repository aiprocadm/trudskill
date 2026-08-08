import { apiRequest } from '../../lib/api/client';

import type {
  DocumentTasksPage,
  EmailDeliveriesPage,
  EmailDelivery,
  QuarantinePage,
  QuarantinedJob
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
 * Ручки экрана «Эксплуатация» (ФТ-I2, Фаза 6 Task 8).
 *
 * Все три уже существуют на бэкенде (Task 7 + повтор письма этой задачи) — здесь только
 * то, через что на них смотрит человек.
 */
export const operationsApi = {
  /** Задачи выпуска документов: интересны прежде всего упавшие и застрявшие. */
  listDocumentTasks: (session: UserSession) =>
    apiRequest<DocumentTasksPage>('/document-tasks', withAuth(session)),

  retryDocumentTask: (session: UserSession, id: string) =>
    apiRequest<{ id: string; status: string }>(`/document-tasks/${id}/retry`, {
      method: 'POST',
      ...withAuth(session)
    }),

  listQuarantine: (session: UserSession, status?: string) =>
    apiRequest<QuarantinePage>(
      `/job-quarantine${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      withAuth(session)
    ),

  republishQuarantined: (session: UserSession, id: string) =>
    apiRequest<QuarantinedJob>(`/job-quarantine/${id}/republish`, {
      method: 'POST',
      ...withAuth(session)
    }),

  discardQuarantined: (session: UserSession, id: string, reason?: string) =>
    apiRequest<QuarantinedJob>(`/job-quarantine/${id}/discard`, {
      method: 'POST',
      ...(reason ? { body: { reason } } : {}),
      ...withAuth(session)
    }),

  listEmailDeliveries: (session: UserSession) =>
    apiRequest<EmailDeliveriesPage>('/email-deliveries', withAuth(session)),

  resendEmail: (session: UserSession, id: string) =>
    apiRequest<EmailDelivery>(`/email-deliveries/${id}/resend`, {
      method: 'POST',
      ...withAuth(session)
    })
};
