import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { courseHistoryApi as CourseHistoryApi } from './course-history';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: 'm@example.com',
    displayName: 'Методист',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['courses.read']
};

describe('история курса (МГ-E2.3, срез 16.4)', () => {
  let api: typeof CourseHistoryApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = (await import('./course-history')).courseHistoryApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('GET /courses/:id/history разворачивает конверт { items, truncated }', async () => {
    const body = {
      items: [
        {
          id: 'a1',
          createdAt: '2026-09-24T10:00:00.000Z',
          action: 'learning.course_updated',
          entityType: 'learning.course',
          actorName: 'Петрова Анна',
          system: false
        }
      ],
      truncated: false
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: body,
          meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-01-01T00:00:00.000Z' }
        }),
        { status: 200 }
      )
    );
    await expect(api.fetch(session, 'course_1')).resolves.toEqual(body);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/courses\/course_1\/history$/);
  });
});
