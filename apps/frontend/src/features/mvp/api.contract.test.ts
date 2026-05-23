import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'demo',
    email: 'demo@example.com',
    displayName: 'Demo',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['users.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('mvp api envelope compatibility', () => {
  let mvpApi: {
    listUsers: (session: UserSession, query: { page: number }) => Promise<{ items: unknown[] }>;
    listCounterparties: (
      session: UserSession,
      query: { page: number }
    ) => Promise<{ items: Array<{ id: string }> }>;
    listTests: (
      session: UserSession,
      query: { page: number }
    ) => Promise<{ items: Array<{ id: string }> }>;
    getAttemptResult: (
      session: UserSession,
      attemptId: string
    ) => Promise<{ finalScore: number; maxScore: number; passed: boolean }>;
    listCommissions: (
      session: UserSession,
      status?: 'active' | 'archived'
    ) => Promise<{ items: Array<{ id: string; code: string }> }>;
    getCommission: (
      session: UserSession,
      id: string
    ) => Promise<{ id: string; members: Array<{ id: string }> }>;
    createCommission: (
      session: UserSession,
      payload: { code: string; name: string }
    ) => Promise<{ id: string; code: string }>;
  };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const importedModule = await import('./api');
    mvpApi = importedModule.mvpApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listUsers reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'u1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listUsers(session, { page: 1 });

    expect(result.items).toHaveLength(1);
  });

  it('listCounterparties reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'c1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listCounterparties(session, { page: 1 });

    expect(result.items[0]?.id).toBe('c1');
  });

  it('listTests reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 't1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listTests(session, { page: 1 });

    expect(result.items[0]?.id).toBe('t1');
  });

  it('getAttemptResult reads result payload from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ finalScore: 88, maxScore: 100, passed: true }), { status: 200 })
    );

    const result = await mvpApi.getAttemptResult(session, 'att_1');

    expect(result.finalScore).toBe(88);
    expect(result.passed).toBe(true);
  });

  it('listCommissions appends status query when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'commission_1', code: 'OT_2026' }] }), { status: 200 })
    );

    const result = await mvpApi.listCommissions(session, 'active');

    expect(result.items[0]?.code).toBe('OT_2026');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/commissions?status=active');
  });

  it('getCommission unwraps members from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'commission_1', members: [{ id: 'cm_1' }] }), { status: 200 })
    );

    const result = await mvpApi.getCommission(session, 'commission_1');

    expect(result.members[0]?.id).toBe('cm_1');
  });

  it('createCommission sends POST with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'commission_new', code: 'PA_1' }), { status: 201 })
    );

    const result = await mvpApi.createCommission(session, { code: 'PA_1', name: 'Test' });

    expect(result.id).toBe('commission_new');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'PA_1', name: 'Test' });
  });
});
