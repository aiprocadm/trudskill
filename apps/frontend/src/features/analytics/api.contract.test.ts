import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { analyticsApi as AnalyticsApi } from './api';
import type { AnalyticsDashboard } from './types';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['enrollments.read']
};

const sample: AnalyticsDashboard = {
  scope: {},
  enrollmentsTotal: 2,
  enrollmentsCompleted: 1,
  completionRate: 0.5,
  examResultsTotal: 1,
  examResultsPassed: 1,
  examPassRate: 1,
  averageCompletionDays: 10,
  averageScorePercent: 0.8,
  attemptDistribution: { passedFirstAttempt: 1, passedSecondAttempt: 0, passedThirdPlusAttempt: 0 },
  dropOffCount: 0,
  dropOffThresholdDays: 14,
  byCourse: [],
  byGroup: []
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('analyticsApi.getDashboard', () => {
  let analyticsApi: typeof AnalyticsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    analyticsApi = importedModule.analyticsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('unwraps the API envelope and hits the right path', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(sample), { status: 200 }));

    const result = await analyticsApi.getDashboard(session, { course_id: 'crs1' });
    expect(result.completionRate).toBe(0.5);

    const calledUrl = String((fetchMock.mock.calls[0] as [string])[0]);
    expect(calledUrl).toContain('/reports/analytics-dashboard');
    expect(calledUrl).toContain('course_id=crs1');
  });
});
