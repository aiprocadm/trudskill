import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation, resolveRouteMeta } from './helpers';

import type { UserSession } from '../../entities/session/model';

const adminSession: UserSession = {
  user: {
    id: 'u_tenant_admin',
    tenantId: 'tenant_demo',
    login: 'tenant_admin',
    email: null,
    status: 'active',
    displayName: 'Tenant Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: [
    'auth.manage_sessions',
    'iam.manage_roles',
    'courses.read',
    'counterparties.read',
    'directions.read',
    'groups.read',
    'enrollments.read'
  ]
};

describe('navigation helpers', () => {
  it('redirects anonymous users from protected route', () => {
    expect(evaluateRouteAccess('/users', null)).toEqual({ kind: 'redirect-login' });
  });

  it('returns forbidden when user has no permission', () => {
    const limited = { ...adminSession, permissions: ['courses.read'] };
    expect(evaluateRouteAccess('/audit', limited)).toEqual({ kind: 'forbidden' });
  });

  it('filters navigation by permissions', () => {
    const limited = { ...adminSession, permissions: ['courses.read'] };
    const visible = getVisibleNavigation(limited).map((item) => item.href);
    expect(visible).toContain('/courses');
    expect(visible).not.toContain('/audit');
  });

  it('resolves nested route metadata using route patterns', () => {
    expect(resolveRouteMeta('/users/create')?.requiredPermissions).toEqual(['iam.manage_roles']);
  });

  it('resolves workspace route metadata', () => {
    expect(resolveRouteMeta('/workspace')?.requiredPermissions).toEqual(['tenant.read']);
  });

  it('normalizes route with query params and trailing slash', () => {
    expect(evaluateRouteAccess('/courses/?tab=all', adminSession)).toEqual({ kind: 'ok' });
  });

  it('allows learner cabinet routes with enrollment read permission', () => {
    const learner = { ...adminSession, permissions: ['enrollments.read'] };
    expect(evaluateRouteAccess('/learner/courses/abc', learner)).toEqual({ kind: 'ok' });
  });

  it('shows workspace in navigation for tenant.read permission', () => {
    const tenantViewer = { ...adminSession, permissions: ['tenant.read'] };
    const visible = getVisibleNavigation(tenantViewer).map((item) => item.href);
    expect(visible).toContain('/workspace');
  });
});
