import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { brandingApi as BrandingApi } from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u_admin', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

describe('branding api contract (ФТ-D3.1)', () => {
  const fetchMock = vi.fn();
  let brandingApi: typeof BrandingApi;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-03T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    brandingApi = (await import('./api')).brandingApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('get разворачивает конверт и ходит с заголовком тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ branding: { displayName: 'УЦ' }, isDefault: false })
    );

    const result = await brandingApi.get(session);

    expect(result.branding.displayName).toBe('УЦ');
    expect(result.isDefault).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant/branding');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });

  it('update шлёт PUT с полями бренда как есть (пустая строка = сброс)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ branding: {}, isDefault: true }));

    await brandingApi.update(session, { displayName: 'УЦ', logoUrl: '' });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant/branding');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ displayName: 'УЦ', logoUrl: '' });
  });
});
