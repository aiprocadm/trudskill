import { describe, expect, it } from 'vitest';
import type { UserSession } from '../entities/session/model';
import { getVisibleNavigation, evaluateRouteAccess } from '../features/navigation/helpers';
import { getRouteBootstrapState } from '../features/auth/use-route-bootstrap';

const methodistSession: UserSession = {
  user: {
    id: 'u_methodist',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: 'methodist@example.com',
    status: 'active',
    displayName: 'Methodist User'
  },
  tokens: {
    accessToken: 'access',
    sessionId: 'session',
    expiresIn: 300
  },
  roles: ['methodist'],
  permissions: ['courses.read', 'groups.read', 'enrollments.read']
};

describe('frontend role-based access flow', () => {
  it('hides restricted sections and actions from limited role navigation', () => {
    const visibleRoutes = getVisibleNavigation(methodistSession).map((item) => item.href);

    expect(visibleRoutes).toContain('/courses');
    expect(visibleRoutes).toContain('/groups');
    expect(visibleRoutes).not.toContain('/settings');
    expect(visibleRoutes).not.toContain('/audit');
  });

  it('redirects unauthenticated user to login for direct protected route access', () => {
    const bootstrap = getRouteBootstrapState('/users', null);

    expect(bootstrap.shouldRedirectToLogin).toBe(true);
    expect(bootstrap.access.kind).toBe('redirect-login');
  });

  it('renders forbidden route outcome for unauthorized direct route access', () => {
    const access = evaluateRouteAccess('/audit', methodistSession);

    expect(access).toEqual({ kind: 'forbidden' });
  });
});
