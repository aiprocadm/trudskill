import { describe, expect, it } from 'vitest';

import {
  evaluateRouteAccess,
  getNavigationView,
  getVisibleNavigation,
  resolveRouteMeta
} from './helpers';
import { navigationModel } from './model';

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

  it('makes the "Мои документы" learner link reachable (has routeMeta)', () => {
    const learner = { ...adminSession, permissions: ['enrollments.read'] };
    expect(evaluateRouteAccess('/learner/documents', learner)).toEqual({ kind: 'ok' });
  });

  it('every navigation link target resolves to a routeMeta entry (no link 404s)', () => {
    const unreachable = navigationModel
      .map((item) => item.href)
      .filter((href) => resolveRouteMeta(href) === null);
    expect(unreachable).toEqual([]);
  });

  it('shows workspace in navigation for tenant.read permission', () => {
    const tenantViewer = { ...adminSession, permissions: ['tenant.read'] };
    const visible = getVisibleNavigation(tenantViewer).map((item) => item.href);
    expect(visible).toContain('/workspace');
  });

  it('builds compact main menu with extra items in "more"', () => {
    const nav = getNavigationView(adminSession);
    expect(nav.main.length).toBeLessThanOrEqual(7);
    expect(nav.more.length).toBeGreaterThan(0);
  });

  // === Phase 2 Plan A — /admin/bulk-enrollments wiring ===

  it('allows /admin/bulk-enrollments with both learners.write and enrollments.write', () => {
    const session = {
      ...adminSession,
      permissions: ['learners.write', 'enrollments.write']
    };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'ok' });
  });

  it('forbids /admin/bulk-enrollments without learners.write', () => {
    const session = { ...adminSession, permissions: ['enrollments.write'] };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'forbidden' });
  });

  it('forbids /admin/bulk-enrollments without enrollments.write', () => {
    const session = { ...adminSession, permissions: ['learners.write'] };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'forbidden' });
  });

  it('shows /admin/bulk-enrollments in nav only when both permissions present', () => {
    const session = {
      ...adminSession,
      permissions: ['learners.write', 'enrollments.write']
    };
    const visible = getVisibleNavigation(session).map((item) => item.href);
    expect(visible).toContain('/admin/bulk-enrollments');
  });
});
