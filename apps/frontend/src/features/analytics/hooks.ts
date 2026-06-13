import { analyticsApi } from './api';
import { useMvpQuery } from '../mvp/hooks';

import type { AnalyticsFilterQuery } from './types';

export const useAnalyticsDashboard = (query: AnalyticsFilterQuery) =>
  useMvpQuery('analyticsDashboard', query, (s) => analyticsApi.getDashboard(s, query));
