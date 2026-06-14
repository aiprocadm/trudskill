import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { pushApi as PushApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: 'learner@example.com',
    displayName: 'Learner',
    status: 'active'
  },
  tokens: { accessToken: 'tk', sessionId: 's1', expiresIn: 300 },
  roles: ['learner'],
  permissions: []
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-06-13T00:00:00.000Z' }
  });

describe('pushApi contract (envelope unwrap + URL/method/body)', () => {
  let pushApi: typeof PushApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const m = await import('./api');
    pushApi = m.pushApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('getPublicKey — GET /web-push/public-key, unwraps { enabled, publicKey } + x-tenant-id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ enabled: true, publicKey: 'BPpub' }), { status: 200 })
    );
    const result = await pushApi.getPublicKey(session);
    expect(result).toEqual({ enabled: true, publicKey: 'BPpub' });

    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/web-push\/public-key$/);
    expect(init.method ?? 'GET').toBe('GET');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });

  it('subscribe — POST /web-push/subscribe with the serialized body + bearer token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'push_1', endpoint: 'https://p/a', createdAt: 'now' }), {
        status: 201
      })
    );
    const body = { endpoint: 'https://p/a', keys: { p256dh: 'x', auth: 'y' }, userAgent: 'FF' };
    const result = await pushApi.subscribe(session, body);
    expect(result.id).toBe('push_1');

    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/web-push\/subscribe$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tk');
  });

  it('unsubscribe — DELETE /web-push/subscribe with { endpoint } body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope({ ok: true }), { status: 200 }));
    const result = await pushApi.unsubscribe(session, 'https://p/a');
    expect(result.ok).toBe(true);

    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/web-push\/subscribe$/);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ endpoint: 'https://p/a' });
  });

  it('listSubscriptions — GET /web-push/subscriptions → array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope([{ id: 'push_1', endpoint: 'https://p/a', createdAt: 'now' }]), {
        status: 200
      })
    );
    const result = await pushApi.listSubscriptions(session);
    expect(result).toHaveLength(1);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/web-push\/subscriptions$/);
    expect(init.method ?? 'GET').toBe('GET');
  });
});
