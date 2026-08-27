import { apiRequest } from '../../lib/api/client';

import type { LearnerDocumentsResponse } from './types';
import type { UserSession } from '../../entities/session/model';

const auth = (session: UserSession) => ({
  userId: session.user.id,
  tenantId: session.user.tenantId,
  accessToken: session.tokens.accessToken
});

export const learnerDocumentsApi = {
  listMine: (session: UserSession) =>
    apiRequest<LearnerDocumentsResponse>(`/me/documents`, { auth: auth(session) }),
  listForEnrollment: (session: UserSession, enrollmentId: string) =>
    apiRequest<LearnerDocumentsResponse>(`/enrollments/${enrollmentId}/documents`, {
      auth: auth(session)
    }),
  /**
   * Ревизия 2026-08-26 (порция 21): скачивание идёт через ручку с авторизацией —
   * она проверяет владение, пишет журнал и отдаёт подписанную ссылку хранилища.
   * Прямое открытие адреса из списка невозможно: браузерный переход не несёт
   * Bearer-заголовок.
   */
  getDownload: (session: UserSession, documentId: string) =>
    apiRequest<{ downloadUrl: string }>(`/me/documents/${documentId}/download`, {
      auth: auth(session)
    })
};
