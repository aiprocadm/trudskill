import { apiRequest } from '../../lib/api/client';

import type { ConsentDocumentsDto, ConsentKind, ConsentStateDto, ConsentStatusDto } from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const consentsApi = {
  /** Состояние обоих согласий текущего слушателя. */
  me: (session: UserSession): Promise<ConsentStatusDto> =>
    apiRequest<ConsentStatusDto>('/consents/me', { method: 'GET', ...withAuth(session) }),
  /** Тексты согласий, опубликованные учебным центром (может не быть ни одного). */
  documents: (session: UserSession): Promise<ConsentDocumentsDto> =>
    apiRequest<ConsentDocumentsDto>('/consents/documents', { method: 'GET', ...withAuth(session) }),
  grant: (session: UserSession, kind: ConsentKind): Promise<unknown> =>
    apiRequest<unknown>(`/consents/me/${kind}/grant`, { method: 'POST', ...withAuth(session) }),
  /** МГ-C5.1 (срез 12.1): согласия слушателя для его карточки — под правом карточки. */
  forLearner: (session: UserSession, learnerId: string): Promise<ConsentStatusDto> =>
    apiRequest<ConsentStatusDto>(`/consents/learners/${learnerId}/status`, {
      method: 'GET',
      ...withAuth(session)
    }),
  /** Бумажное согласие получено: дата подписи и скан из личного дела. */
  markPaper: (
    session: UserSession,
    learnerId: string,
    kind: ConsentKind,
    payload: { signedAt: string; fileId?: string }
  ): Promise<ConsentStateDto> =>
    apiRequest<ConsentStateDto>(`/consents/learners/${learnerId}/${kind}/paper`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  /** Отзыв ОДНОГО вида согласия — второй не затрагивается. */
  revoke: (session: UserSession, kind: ConsentKind): Promise<ConsentStateDto> =>
    apiRequest<ConsentStateDto>(`/consents/me/${kind}/revoke`, {
      method: 'POST',
      ...withAuth(session)
    })
};
