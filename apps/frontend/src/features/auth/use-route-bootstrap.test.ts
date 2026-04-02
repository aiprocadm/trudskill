import { describe, expect, it } from 'vitest';
import type { UserSession } from '../../entities/session/model';
import { getRouteBootstrapState } from './use-route-bootstrap';

const session: UserSession = {
  user: { id: 'u_tenant_admin', tenantId: 'tenant_demo', login: 'tenant_admin', email: null, status: 'active', displayName: 'Tenant Admin' },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['tenant.read']
};

describe('route bootstrap state', () => {
  it('marks redirect to login for anonymous session', () => {
    const bootstrap = getRouteBootstrapState('/documents', null);
    expect(bootstrap.shouldRedirectToLogin).toBe(true);
  });

  it('marks forbidden redirect for missing permission', () => {
    const bootstrap = getRouteBootstrapState('/settings', session);
    expect(bootstrap.shouldRedirectToForbidden).toBe(true);
  });

  it('marks not-found redirect for unknown route', () => {
    const bootstrap = getRouteBootstrapState('/missing', session);
    expect(bootstrap.shouldRedirectToNotFound).toBe(true);
  });
});
