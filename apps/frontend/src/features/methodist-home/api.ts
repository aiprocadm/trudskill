import { apiRequest } from '../../lib/api/client';

import type { MethodistDashboard } from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const methodistHomeApi = {
  /** ФТ-H2: одна ручка на весь экран — дашборд собирается на сервере за один проход. */
  loadDashboard: (session: UserSession): Promise<MethodistDashboard> =>
    apiRequest<MethodistDashboard>('/dashboards/methodist', {
      method: 'GET',
      ...withAuth(session)
    })
};
