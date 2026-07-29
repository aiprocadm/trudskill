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
  /** Отзыв ОДНОГО вида согласия — второй не затрагивается. */
  revoke: (session: UserSession, kind: ConsentKind): Promise<ConsentStateDto> =>
    apiRequest<ConsentStateDto>(`/consents/me/${kind}/revoke`, {
      method: 'POST',
      ...withAuth(session)
    })
};
