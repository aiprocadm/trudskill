import { apiRequest } from '../api/client';

import type { UserSession } from '../../entities/session/model';

const auth = (session: UserSession) => ({
  auth: { userId: session.user.id, tenantId: session.user.tenantId, accessToken: session.tokens.accessToken }
});

export interface WebinarDto {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  plannedStartAt: string;
  plannedEndAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export const webinarsApi = {
  list: (session: UserSession) => apiRequest<WebinarDto[]>('/webinars', auth(session))
};
