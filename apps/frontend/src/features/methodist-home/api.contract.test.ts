import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { methodistHomeApi as MethodistHomeApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: null,
    status: 'active',
    displayName: 'Методист'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['groups.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-08-05T00:00:00.000Z' }
  });

describe('methodistHomeApi (ФТ-H2, Фаза 5 Task 2)', () => {
  let methodistHomeApi: typeof MethodistHomeApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    methodistHomeApi = (await import('./api')).methodistHomeApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('весь экран собирается ОДНИМ запросом и разворачивается из конверта', () => {
    const payload = {
      asOf: '2026-08-05T00:00:00.000Z',
      horizonDays: 14,
      upcomingDeadlines: [
        { groupId: 'g1', groupName: 'Группа 1', dueAt: '2026-08-10', learnersCount: 3, daysLeft: 5 }
      ],
      overdueGroups: [],
      coursesWithoutExam: [],
      totals: {
        activeGroups: 1,
        activeLearners: 3,
        upcomingDeadlines: 1,
        overdueGroups: 0,
        coursesWithoutExam: 0
      },
      reviewQueue: { pendingAttempts: 2, pendingSubmissions: 1, total: 3 }
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(payload), { status: 200 }));

    return methodistHomeApi.loadDashboard(session).then((result) => {
      expect(result.upcomingDeadlines[0]?.groupName).toBe('Группа 1');
      expect(result.reviewQueue.total).toBe(3);

      // Один запрос, не веер: сводка собирается на сервере за один проход по состоянию.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toContain('/dashboards/methodist');
      expect(init.method).toBe('GET');
    });
  });
});
