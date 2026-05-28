import { apiRequest } from '../../lib/api/client';

import type {
  LearnerListItem,
  LearnersListFilters,
  LearnersListResponse,
  UpdateLearnerProfilePayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const learnersApi = {
  list: (session: UserSession, filters: LearnersListFilters): Promise<LearnersListResponse> => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
    const qs = params.toString();
    return apiRequest<LearnersListResponse>(qs ? `/learners?${qs}` : '/learners', {
      method: 'GET',
      ...withAuth(session)
    });
  },

  updateProfile: (
    session: UserSession,
    learnerId: string,
    payload: UpdateLearnerProfilePayload
  ): Promise<LearnerListItem> =>
    apiRequest<LearnerListItem>(`/learners/${learnerId}/profile`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    })
};
