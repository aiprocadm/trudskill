import { describe, expect, it } from 'vitest';
import type { UserSession } from '../entities/session/model';
import { evaluateRouteAccess } from '../features/navigation/helpers';

const authorizedSession: UserSession = {
  user: { id: 'u_tenant_admin', tenantId: 'tenant_demo', login: 'tenant_admin', email: null, status: 'active', displayName: 'Tenant Admin' },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 100 },
  roles: ['tenant_admin'],
  permissions: ['tenant.read', 'iam.manage_roles', 'auth.manage_sessions']
};

describe('auth and routing e2e scenarios (logic-level)', () => {
  it('redirects anonymous user to login for protected route', () => {
    expect(evaluateRouteAccess('/documents', null)).toEqual({ kind: 'redirect-login' });
  });

  it('allows access after login session exists', () => {
    expect(evaluateRouteAccess('/documents', authorizedSession)).toEqual({ kind: 'ok' });
  });

  it('shows forbidden for protected route without permission', () => {
    const session = { ...authorizedSession, permissions: ['tenant.read'] };
    expect(evaluateRouteAccess('/settings', session)).toEqual({ kind: 'forbidden' });
  });

  it('returns not-found for unknown route map entry', () => {
    expect(evaluateRouteAccess('/totally-missing-route', authorizedSession)).toEqual({ kind: 'not-found' });
  });

  it('denies access after logout when session is not available anymore', () => {
    const accessBeforeLogout = evaluateRouteAccess('/users', authorizedSession);
    const accessAfterLogout = evaluateRouteAccess('/users', null);

    expect(accessBeforeLogout).toEqual({ kind: 'ok' });
    expect(accessAfterLogout).toEqual({ kind: 'redirect-login' });
  });
});
