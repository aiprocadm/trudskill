import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ALL_TENANT_STATUSES,
  type PlatformTenantStatus,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONES,
  canImpersonate,
  nextStatusOptions
} from './types';

import type {
  hydrateImpersonatedSession as HydrateImpersonatedSession,
  platformTenantsApi as PlatformTenantsApi
} from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u_platform', tenantId: 'tenant_platform' },
  tokens: { accessToken: 'platform-token' }
} as UserSession;

describe('platform-tenants types (ФТ-D2.2 срез 3)', () => {
  it('статусы совпадают с жизненным циклом сервера (CHECK 0072)', () => {
    expect(ALL_TENANT_STATUSES).toEqual(['trial', 'active', 'suspended', 'archived']);
  });

  it('у каждого статуса есть русская подпись и тон', () => {
    for (const status of ALL_TENANT_STATUSES) {
      expect(TENANT_STATUS_LABELS[status].length).toBeGreaterThan(0);
      expect(TENANT_STATUS_TONES[status]).toBeTruthy();
    }
  });

  it('переходы: из архива — только в приостановленные, сам статус не предлагается', () => {
    expect(nextStatusOptions('archived')).toEqual(['suspended']);
    for (const status of ALL_TENANT_STATUSES) {
      expect(nextStatusOptions(status)).not.toContain(status);
    }
  });

  it('вход «от имени» недоступен только для архива — как на сервере (tenant_archived)', () => {
    const allowed = ALL_TENANT_STATUSES.filter((status: PlatformTenantStatus) =>
      canImpersonate(status)
    );
    expect(allowed).toEqual(['trial', 'active', 'suspended']);
  });
});

describe('platform-tenants api contract (ФТ-D2.2 срез 3)', () => {
  const fetchMock = vi.fn();
  let platformTenantsApi: typeof PlatformTenantsApi;
  let hydrateImpersonatedSession: typeof HydrateImpersonatedSession;

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
    const mod = await import('./api');
    platformTenantsApi = mod.platformTenantsApi;
    hydrateImpersonatedSession = mod.hydrateImpersonatedSession;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list разворачивает конверт и шлёт заголовок платформенного тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope([{ id: 't1', code: 'demo', name: 'Демо', status: 'active' }])
    );

    const result = await platformTenantsApi.list(session);

    expect(result[0]?.code).toBe('demo');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/platform/tenants');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_platform');
  });

  it('changeStatus шлёт PATCH …/status с новым статусом', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ id: 't1', code: 'demo', name: 'Демо', status: 'suspended' })
    );

    const result = await platformTenantsApi.changeStatus(session, 't1', 'suspended');

    expect(result.status).toBe('suspended');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/platform/tenants/t1/status');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'suspended' });
  });

  it('impersonate ходит с credentials: refresh-cookie целевой сессии ставит сервер', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        tenantId: 't1',
        userId: 'u_target',
        session: { accessToken: 'target-token', sessionId: 's1', expiresIn: 900, claims: {} }
      })
    );

    const result = await platformTenantsApi.impersonate(session, 't1');

    expect(result.session.accessToken).toBe('target-token');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/platform/tenants/t1/impersonate');
    expect(init.credentials).toBe('include');
  });

  it('hydrateImpersonatedSession запрашивает /auth/me и роли с ЯВНЫМ тенантом цели', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        envelope({
          id: 'u_target',
          tenantId: 't1',
          login: 'tenant_admin',
          email: null,
          status: 'active',
          displayName: 'Админ центра',
          permissions: ['tenant.read']
        })
      )
      .mockResolvedValueOnce(envelope([{ code: 'tenant_admin' }]));

    const tokens = { accessToken: 'target-token', sessionId: 's1', expiresIn: 900, claims: {} };
    const hydrated = await hydrateImpersonatedSession(tokens as never, 't1');

    expect(hydrated.user.id).toBe('u_target');
    expect(hydrated.roles).toEqual(['tenant_admin']);
    expect(hydrated.permissions).toEqual(['tenant.read']);
    // Оба запроса обязаны идти с x-tenant-id ЦЕЛИ — с дефолтным заголовком клиента
    // TenantGuard ответил бы tenant_header_mismatch.
    for (const call of fetchMock.mock.calls) {
      const [, init] = call as [string, RequestInit];
      expect(new Headers(init.headers).get('x-tenant-id')).toBe('t1');
    }
  });
});
