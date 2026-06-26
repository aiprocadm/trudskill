import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { notificationRecipientsApi as RecipientsApi } from './api';
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
  permissions: ['notifications.read', 'notifications.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('notificationRecipientsApi envelope compatibility (Phase 5C-2)', () => {
  let notificationRecipientsApi: typeof RecipientsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    notificationRecipientsApi = (await import('./api')).notificationRecipientsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('get unwraps the emails envelope from GET /notification-staff-recipients', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ emails: ['admin@uc.ru', 'curator@uc.ru'] }), { status: 200 })
    );

    const result = await notificationRecipientsApi.get(session);
    expect(result).toEqual(['admin@uc.ru', 'curator@uc.ru']);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/notification-staff-recipients');
    expect(init.method).toBe('GET');
  });

  it('set PUTs the emails array and unwraps the response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ emails: ['admin@uc.ru'] }), { status: 200 })
    );

    const result = await notificationRecipientsApi.set(session, ['admin@uc.ru']);
    expect(result).toEqual(['admin@uc.ru']);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/notification-staff-recipients');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string) as { emails: string[] };
    expect(body.emails).toEqual(['admin@uc.ru']);
  });
});
