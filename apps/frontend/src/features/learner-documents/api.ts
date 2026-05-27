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
    })
};
