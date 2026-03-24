import { describe, expect, it } from 'vitest';
import type { UserSession } from '../../entities/session/model';
import { evaluateRouteAccess, getVisibleNavigation, resolveRouteMeta } from './helpers';

const adminSession: UserSession = {
  user: { id: 'u_tenant_admin', tenantId: 'tenant_demo', login: 'tenant_admin', email: null, status: 'active', displayName: 'Tenant Admin' },
  tokens: { accessToken: 'a', refreshToken: 'r', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['auth.manage_sessions', 'iam.manage_roles', 'tenant.read']
};

describe('navigation helpers', () => {
  it('redirects anonymous users from protected route', () => {
    expect(evaluateRouteAccess('/users', null)).toEqual({ kind: 'redirect-login' });
  });

  it('returns forbidden when user has no permission', () => {
    const limited = { ...adminSession, permissions: ['tenant.read'] };
    expect(evaluateRouteAccess('/audit', limited)).toEqual({ kind: 'forbidden' });
  });

  it('filters navigation by permissions', () => {
    const limited = { ...adminSession, permissions: ['tenant.read'] };
    const visible = getVisibleNavigation(limited).map((item) => item.href);
    expect(visible).toContain('/courses');
    expect(visible).not.toContain('/audit');
  });

  it('resolves nested route metadata using route patterns', () => {
    expect(resolveRouteMeta('/users/create')?.requiredPermissions).toEqual(['iam.manage_roles']);
  });

  it('normalizes route with query params and trailing slash', () => {
    expect(evaluateRouteAccess('/courses/?tab=all', adminSession)).toEqual({ kind: 'ok' });
  });
});
