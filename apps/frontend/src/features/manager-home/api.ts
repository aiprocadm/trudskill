import { apiRequest } from '../../lib/api/client';

import type { ManagerDashboard } from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const managerHomeApi = {
  /** ТЗ 8.3: одна ручка на весь экран — панель собирается на сервере за один проход. */
  loadDashboard: (session: UserSession): Promise<ManagerDashboard> =>
    apiRequest<ManagerDashboard>('/dashboards/manager', {
      method: 'GET',
      ...withAuth(session)
    })
};
