import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { issueSignedAccessToken } from '../../modules/iam/crypto.util.js';

import type { TenantGuard } from './tenant.guard.js';

vi.mock('../../env.js', () => ({
  backendEnv: {
    AUTH_JWT_SECRET: 'dev-jwt-secret-12345'
  }
}));

let TenantGuardClass: { new (): TenantGuard };

beforeAll(async () => {
  ({ TenantGuard: TenantGuardClass } = await import('./tenant.guard.js'));
});

const makeGuard = () =>
  new TenantGuardClass({
    getJwtSigningSecret: () => 'dev-jwt-secret-12345'
  } as never);

const makeExecutionContext = (headers: Record<string, string>, path = '/api/v1/documents') => ({
  switchToHttp: () => ({
    getRequest: () => ({
      ip: '127.0.0.1',
      path,
      header: (name: string) => headers[name.toLowerCase()]
    })
  })
});

describe('TenantGuard', () => {
  it('rejects spoofed x-user-id/x-tenant-id headers without bearer token', () => {
    const guard = makeGuard();
    const context = makeExecutionContext({ 'x-user-id': 'u_admin', 'x-tenant-id': 'tenant_demo' });

    expect(() => guard.canActivate(context as never)).toThrow(UnauthorizedException);
  });

  it('resolves tenant and user only from a signed bearer token (optional x-tenant-id must match)', () => {
    const guard = makeGuard();
    const accessToken = issueSignedAccessToken(
      {
        sub: 'u_tenant_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_1',
        roles: ['iam.manage_roles']
      },
      'dev-jwt-secret-12345',
      300
    );

    const contextOk = makeExecutionContext({
      authorization: `Bearer ${accessToken}`,
      'x-tenant-id': 'tenant_demo'
    });
    expect(guard.canActivate(contextOk as never)).toBe(true);

    const contextBearerOnly = makeExecutionContext({
      authorization: `Bearer ${accessToken}`
    });
    expect(guard.canActivate(contextBearerOnly as never)).toBe(true);

    const contextSpoof = makeExecutionContext({
      authorization: `Bearer ${accessToken}`,
      'x-tenant-id': 'tenant_spoofed',
      'x-user-id': 'u_spoofed'
    });
    expect(() => guard.canActivate(contextSpoof as never)).toThrow(BadRequestException);
  });

  it('rejects expired access token', () => {
    const guard = makeGuard();
    const accessToken = issueSignedAccessToken(
      {
        sub: 'u_tenant_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_1',
        roles: ['iam.manage_roles']
      },
      'dev-jwt-secret-12345',
      -1
    );

    const context = makeExecutionContext({
      authorization: `Bearer ${accessToken}`,
      'x-tenant-id': 'tenant_demo'
    });
    expect(() => guard.canActivate(context as never)).toThrow(UnauthorizedException);
  });
});

// Восстановление сессии после F5 идёт в два шага: GET /auth/csrf (эхо csrf-cookie) →
// POST /auth/refresh с этим токеном. Если первый шаг требует bearer, восстановление
// падает всегда — пользователя выбрасывает из системы при каждом обновлении страницы.
describe('TenantGuard — bootstrap-маршрут /auth/csrf', () => {
  const makeRequest = (headers: Record<string, string>, path: string) => ({
    ip: '127.0.0.1',
    path,
    url: path,
    route: { path },
    header: (name: string) => headers[name.toLowerCase()],
    context: undefined as { tenantId?: string; userId?: string } | undefined
  });

  const makeContext = (request: ReturnType<typeof makeRequest>) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

  it('пускает GET /auth/csrf без bearer, когда пришёл x-tenant-id', () => {
    const guard = makeGuard();
    const request = makeRequest({ 'x-tenant-id': 'tenant_demo' }, '/api/v1/auth/csrf');

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.context?.tenantId).toBe('tenant_demo');
    // Пользователь при этом НЕ считается опознанным: bearer'а не было.
    expect(request.context?.userId).toBeUndefined();
  });

  it('не пускает /auth/csrf без x-tenant-id — как и остальные bootstrap-маршруты', () => {
    const guard = makeGuard();

    expect(() => guard.canActivate(makeContext(makeRequest({}, '/api/v1/auth/csrf')))).toThrow(
      UnauthorizedException
    );
  });

  it('не пускает соседние /auth/* ручки без bearer', () => {
    const guard = makeGuard();

    for (const path of ['/api/v1/auth/me', '/api/v1/auth/logout', '/api/v1/auth/csrf/rotate']) {
      expect(() =>
        guard.canActivate(makeContext(makeRequest({ 'x-tenant-id': 'tenant_demo' }, path)))
      ).toThrow(UnauthorizedException);
    }
  });

  it('не принимает /auth/csrf, подсунутый в строке запроса', () => {
    const guard = makeGuard();
    // Маршрут не сматчился (route/path пустые) — охранник падает назад на request.url,
    // куда злоумышленник дописал /auth/csrf. Решение должно зависеть только от ПУТИ.
    const maliciousRequest = {
      ip: '127.0.0.1',
      route: undefined,
      path: undefined,
      url: '/api/v1/learners?next=/auth/csrf',
      header: (name: string) => (name.toLowerCase() === 'x-tenant-id' ? 'tenant_victim' : undefined)
    };

    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => maliciousRequest })
      } as never)
    ).toThrow(UnauthorizedException);
  });
});
