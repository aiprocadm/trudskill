import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminSession: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: [
    'tenant.read',
    'iam.manage_roles',
    'auth.manage_sessions',
    'courses.read',
    'groups.read'
  ]
};

describe('lms role flows', () => {
  it('admin sees enterprise routes in navigation', () => {
    const nav = getVisibleNavigation(adminSession).map((item) => item.href);
    expect(nav).toContain('/audit');
    expect(nav).toContain('/reports');
    expect(nav).toContain('/workspace');
  });

  it('anonymous user has no access to protected enterprise modules', () => {
    expect(evaluateRouteAccess('/audit', null)).toEqual({ kind: 'redirect-login' });
    expect(evaluateRouteAccess('/gov-export', null)).toEqual({ kind: 'redirect-login' });
  });

  it('authenticated user can access core lms modules with permissions', () => {
    expect(evaluateRouteAccess('/courses', adminSession)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/groups', adminSession)).toEqual({ kind: 'ok' });
  });
});
