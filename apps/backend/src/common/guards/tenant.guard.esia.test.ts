import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { TenantGuard } from './tenant.guard.js';

import type { ExecutionContext } from '@nestjs/common';

// Minimal express-like request stub: no authorization header, no x-tenant-id.
const makeRequest = (routePath: string) => ({
  header: (_name: string): string | undefined => undefined,
  path: routePath,
  url: routePath,
  route: { path: routePath },
  ip: '127.0.0.1'
});

const makeContext = (routePath: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => makeRequest(routePath) })
  }) as unknown as ExecutionContext;

describe('TenantGuard — ЕСИА OAuth routes', () => {
  const guard = new TenantGuard();

  it('lets /auth/esia/authorize through without bearer or x-tenant-id', () => {
    expect(guard.canActivate(makeContext('/api/v1/auth/esia/authorize'))).toBe(true);
  });

  it('lets /auth/esia/callback through without bearer or x-tenant-id', () => {
    expect(guard.canActivate(makeContext('/api/v1/auth/esia/callback'))).toBe(true);
  });

  it('still rejects a non-esia route with no auth', () => {
    expect(() => guard.canActivate(makeContext('/api/v1/learners'))).toThrow(UnauthorizedException);
  });

  it('does not treat a query string containing /auth/esia/ as an ESIA route (no route match)', () => {
    // Adversarial request: route is unresolved (route=undefined, path=undefined) so the
    // guard falls back to request.url — which an attacker stuffed with /auth/esia/ in the
    // query string. The security decision must depend on the PATH, never the query.
    const maliciousRequest = {
      header: (_name: string): string | undefined => undefined,
      route: undefined,
      path: undefined,
      url: '/api/v1/learners?redirect=/auth/esia/callback',
      ip: '127.0.0.1'
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => maliciousRequest })
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('does not treat a query string ending in /auth/login as a bootstrap route', () => {
    const maliciousRequest = {
      header: (name: string): string | undefined =>
        name === 'x-tenant-id' ? 'tenant_victim' : undefined,
      route: undefined,
      path: undefined,
      url: '/api/v1/learners?next=/auth/login',
      ip: '127.0.0.1'
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => maliciousRequest })
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
