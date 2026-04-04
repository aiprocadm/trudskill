import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

describe('auth api envelope compatibility', () => {
  let authApi: { me: (accessToken: string) => Promise<{ id: string; login: string }> };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const module = await import('./auth-api');
    authApi = module.authApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('me unwraps backend envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: 'u1', tenantId: 'tenant_demo', login: 'tenant_admin', email: null, displayName: 'Admin', status: 'active' },
          meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
        }),
        { status: 200 }
      )
    );

    const me = await authApi.me('token');

    expect(me.id).toBe('u1');
    expect(me.login).toBe('tenant_admin');
  });


  it('me fails on invalid response envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'u1', login: 'tenant_admin' }), { status: 200 }));

    await expect(authApi.me('token')).rejects.toMatchObject({
      normalized: { code: 'INVALID_RESPONSE_ENVELOPE' }
    });
  });
});
