import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { clientsApi as ClientsApi } from './api';
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
  permissions: ['counterparties.read', 'counterparties.write', 'enrollments.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('clientsApi envelope compatibility (Phase 2 Plan C Task 8)', () => {
  let clientsApi: typeof ClientsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    clientsApi = importedModule.clientsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list unwraps envelope and builds URL with all filters', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          items: [
            {
              id: 'cp_1',
              tenantId: 'tenant_demo',
              code: 'OOO-X',
              name: 'ООО Х',
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            }
          ],
          total: 1,
          page: 2,
          pageSize: 10
        }),
        { status: 200 }
      )
    );

    const result = await clientsApi.list(session, {
      q: 'иванов',
      status: 'active',
      page: 2,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('cp_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.pathname).toContain('/counterparties');
    expect(url.searchParams.get('q')).toBe('иванов');
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('10');
    expect(init.method).toBe('GET');
  });

  it('list builds clean URL when filters are empty', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    );

    await clientsApi.list(session, {});

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.searchParams.toString()).toBe('');
    expect(url.pathname).toContain('/counterparties');
  });

  it('get fetches /counterparties/:id via GET', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'cp_1',
          tenantId: 'tenant_demo',
          code: 'OOO-X',
          name: 'ООО Х',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await clientsApi.get(session, 'cp_1');
    expect(result.id).toBe('cp_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/counterparties/cp_1');
    expect(init.method).toBe('GET');
  });

  it('create POSTs /counterparties/extended with body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'cp_new',
          tenantId: 'tenant_demo',
          code: 'NEW',
          name: 'Новая',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const payload = { code: 'NEW', name: 'Новая', inn: '7707083893' };
    const result = await clientsApi.create(session, payload);

    expect(result.id).toBe('cp_new');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/counterparties/extended');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as typeof payload;
    expect(body.code).toBe('NEW');
    expect(body.inn).toBe('7707083893');
  });

  it('updateProfile PATCHes /counterparties/:id/profile with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'cp_1',
          tenantId: 'tenant_demo',
          code: 'X',
          name: 'X',
          inn: '7707083893',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const payload = { inn: '7707083893', contactEmail: null };
    const result = await clientsApi.updateProfile(session, 'cp_1', payload);

    expect(result.inn).toBe('7707083893');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/counterparties/cp_1/profile');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as { inn?: string; contactEmail: null };
    expect(body.inn).toBe('7707083893');
    expect(body.contactEmail).toBeNull();
  });

  it('getProgressSummary fetches /counterparties/:id/progress-summary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          counterpartyId: 'cp_1',
          totalLearners: 3,
          enrollments: { total: 5, completed: 2, inProgress: 2, notStarted: 1 },
          avgCompletionRate: 0.4,
          perCourse: []
        }),
        { status: 200 }
      )
    );

    const result = await clientsApi.getProgressSummary(session, 'cp_1');
    expect(result.totalLearners).toBe(3);
    expect(result.enrollments.completed).toBe(2);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/counterparties/cp_1/progress-summary');
    expect(init.method).toBe('GET');
  });

  it('setGroupCounterparty PATCHes /groups/:id/counterparty with non-null id', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(null), { status: 200 }));

    await clientsApi.setGroupCounterparty(session, 'g_1', 'cp_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/groups/g_1/counterparty');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as { counterpartyId: string | null };
    expect(body.counterpartyId).toBe('cp_1');
  });

  it('setGroupCounterparty PATCHes with counterpartyId=null to unlink', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(null), { status: 200 }));

    await clientsApi.setGroupCounterparty(session, 'g_1', null);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/groups/g_1/counterparty');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as { counterpartyId: string | null };
    expect(body.counterpartyId).toBeNull();
  });

  it('getGroupProgressSummary fetches /groups/:id/progress-summary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          groupId: 'g_1',
          totalLearners: 2,
          enrollments: { total: 2, completed: 1, inProgress: 1, notStarted: 0 },
          avgCompletionRate: 0.5,
          perCourse: [{ courseId: 'c_1', total: 2, completed: 1 }]
        }),
        { status: 200 }
      )
    );

    const result = await clientsApi.getGroupProgressSummary(session, 'g_1');
    expect(result.groupId).toBe('g_1');
    expect(result.perCourse).toHaveLength(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/groups/g_1/progress-summary');
    expect(init.method).toBe('GET');
  });
});
