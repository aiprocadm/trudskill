import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

/**
 * Phase 5C-2 — настройка email сотрудников (admin/curator) для staff-копии уведомлений
 * (переаттестация / дедлайн / отзыв документа). Пустой список = функция выключена.
 */
export const notificationRecipientsApi = {
  get: (session: UserSession): Promise<string[]> =>
    apiRequest<{ emails: string[] }>('/notification-staff-recipients', withAuth(session)).then(
      (r) => r.emails
    ),

  set: (session: UserSession, emails: string[]): Promise<string[]> =>
    apiRequest<{ emails: string[] }>('/notification-staff-recipients', {
      method: 'PUT',
      body: { emails },
      ...withAuth(session)
    }).then((r) => r.emails)
};
