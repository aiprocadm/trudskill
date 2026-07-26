import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { authApi as AuthApi, isTotpChallenge as IsTotpChallenge } from './auth-api';

/** Контракт 2FA-эндпоинтов (ФТ-G3): пути, методы, разбор union-ответа логина. */
describe('authApi 2FA contract', () => {
  const fetchMock = vi.fn();
  let authApi: typeof AuthApi;
  let isTotpChallenge: typeof IsTotpChallenge;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: 'now' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./auth-api');
    authApi = mod.authApi;
    isTotpChallenge = mod.isTotpChallenge;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('login may return a totp challenge instead of tokens', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ totpRequired: true, challengeToken: 'challenge-1' })
    );
    const outcome = await authApi.login({ login: 'tenant_admin', password: 'x' });
    expect(isTotpChallenge(outcome)).toBe(true);
    if (isTotpChallenge(outcome)) {
      expect(outcome.challengeToken).toBe('challenge-1');
    }
  });

  it('verifyTotp POSTs the challenge and code to /auth/2fa/verify with cookies', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ accessToken: 'at', sessionId: 's1', expiresIn: 900, claims: {} })
    );
    await authApi.verifyTotp({ challengeToken: 'challenge-1', code: '123456' });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/auth/2fa/verify');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({
      challengeToken: 'challenge-1',
      code: '123456'
    });
  });

  it('setup/confirm/disable/status hit their endpoints with the bearer token', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(envelope({ enabled: false, pending: false, eligible: true }))
      .mockResolvedValueOnce(
        envelope({ secret: 'S', otpauthUrl: 'otpauth://x', qrDataUrl: 'data:' })
      )
      .mockResolvedValueOnce(envelope({ enabled: true }))
      .mockResolvedValueOnce(envelope({ enabled: false }));

    await authApi.totpStatus('token-1');
    await authApi.totpSetup('token-1');
    await authApi.totpConfirm('123456', 'token-1');
    await authApi.totpDisable('654321', 'token-1');

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toContain('/auth/2fa/status');
    expect(calls[1]![0]).toContain('/auth/2fa/setup');
    expect(calls[2]![0]).toContain('/auth/2fa/confirm');
    expect(calls[3]![0]).toContain('/auth/2fa/disable');
    for (const [, init] of calls) {
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-1');
    }
    expect(JSON.parse(calls[2]![1].body as string)).toEqual({ code: '123456' });
  });
});
