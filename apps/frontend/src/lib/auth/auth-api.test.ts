import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

describe('auth api envelope compatibility', () => {
  let authApi: {
    me: (accessToken: string) => Promise<{ id: string; login: string }>;
    magicLinkRequest: (payload: { email: string }) => Promise<{ status: 'sent' }>;
    magicLinkRedeem: (payload: { token: string }) => Promise<{ accessToken: string }>;
  };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const importedModule = await import('./auth-api');
    authApi = importedModule.authApi;
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
          data: {
            id: 'u1',
            tenantId: 'tenant_demo',
            login: 'tenant_admin',
            email: null,
            displayName: 'Admin',
            status: 'active'
          },
          meta: {
            requestId: 'req-1',
            correlationId: 'corr-1',
            timestamp: '2026-01-01T00:00:00.000Z'
          }
        }),
        { status: 200 }
      )
    );

    const me = await authApi.me('token');

    expect(me.id).toBe('u1');
    expect(me.login).toBe('tenant_admin');
  });

  it('me fails on invalid response envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'u1', login: 'tenant_admin' }), { status: 200 })
    );

    await expect(authApi.me('token')).rejects.toMatchObject({
      normalized: { code: 'INVALID_RESPONSE_ENVELOPE' }
    });
  });

  it('magicLinkRequest posts to /auth/magic-link/request and unwraps envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { status: 'sent' },
          meta: {
            requestId: 'req-ml-1',
            correlationId: 'corr-ml-1',
            timestamp: '2026-05-22T00:00:00.000Z'
          }
        }),
        { status: 201 }
      )
    );

    const result = await authApi.magicLinkRequest({ email: 'user@example.ru' });

    expect(result).toEqual({ status: 'sent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain('/auth/magic-link/request');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.credentials).toBe('include');
    expect(JSON.parse(requestInit?.body as string)).toEqual({ email: 'user@example.ru' });
  });

  it('magicLinkRedeem unwraps token envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { accessToken: 'at-1', sessionId: 's-1', expiresIn: 900 },
          meta: {
            requestId: 'req-ml-2',
            correlationId: 'corr-ml-2',
            timestamp: '2026-05-22T00:00:00.000Z'
          }
        }),
        { status: 201 }
      )
    );

    const tokens = await authApi.magicLinkRedeem({ token: 'raw-token-123' });

    expect(tokens.accessToken).toBe('at-1');
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.credentials).toBe('include');
    expect(JSON.parse(requestInit?.body as string)).toEqual({ token: 'raw-token-123' });
  });
});
