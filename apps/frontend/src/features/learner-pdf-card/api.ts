import { apiRequest } from '../../lib/api/client';

import type { LearnerPdfCardAggregate } from './types';
import type { UserSession } from '../../entities/session/model';

export const learnerPdfCardApi = {
  fetch: (session: UserSession, learnerId: string) =>
    apiRequest<LearnerPdfCardAggregate>(`/learners/${learnerId}/pdf-card`, {
      auth: {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        accessToken: session.tokens.accessToken
      }
    })
};
