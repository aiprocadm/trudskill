import { apiRequest } from '../../lib/api/client';
import { queryString, withAuth } from '../mvp/api';

import type { AnalyticsDashboard, AnalyticsFilterQuery } from './types';
import type { UserSession } from '../../entities/session/model';

export const analyticsApi = {
  getDashboard: (session: UserSession, query: AnalyticsFilterQuery) =>
    apiRequest<AnalyticsDashboard>(
      `/reports/analytics-dashboard${queryString(query)}`,
      withAuth(session)
    )
};
