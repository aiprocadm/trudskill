import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const makeSession = (permissions: string[]): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions
});

describe('/admin/payments/settings access', () => {
  it('denies unauthenticated users (no session)', () => {
    expect(evaluateRouteAccess('/admin/payments/settings', null).kind).toBe('redirect-login');
  });

  it('denies a session without payments.configure', () => {
    expect(
      evaluateRouteAccess('/admin/payments/settings', makeSession(['payments.read'])).kind
    ).toBe('forbidden');
  });

  it('allows a session with payments.configure', () => {
    expect(
      evaluateRouteAccess('/admin/payments/settings', makeSession(['payments.configure'])).kind
    ).toBe('ok');
  });

  it('does not inherit payments.read policy from /admin/orders sibling route', () => {
    // /admin/payments/settings must resolve to payments.configure, not payments.read
    const sessionWithReadOnly = makeSession(['payments.read']);
    expect(evaluateRouteAccess('/admin/payments/settings', sessionWithReadOnly).kind).toBe(
      'forbidden'
    );
  });
});
