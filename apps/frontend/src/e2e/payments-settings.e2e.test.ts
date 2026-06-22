import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

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

  it('/admin/orders IS reachable with payments.read, while /admin/payments/settings is not', () => {
    // Guards against prefix-match ordering: /admin/payments/settings must resolve to
    // payments.configure, not payments.read — the sibling /admin/orders policy must stay distinct.
    const sessionWithReadOnly = makeSession(['payments.read']);
    expect(evaluateRouteAccess('/admin/orders', sessionWithReadOnly).kind).toBe('ok');
    expect(evaluateRouteAccess('/admin/payments/settings', sessionWithReadOnly).kind).toBe(
      'forbidden'
    );
  });
});

describe('payments settings — navigation visibility', () => {
  it('settings nav item (/admin/payments/settings) visible with payments.configure', () => {
    const hrefs = getVisibleNavigation(makeSession(['payments.configure'])).map((i) => i.href);
    expect(hrefs).toContain('/admin/payments/settings');
  });

  it('settings nav item (/admin/payments/settings) NOT visible with only payments.read', () => {
    const hrefs = getVisibleNavigation(makeSession(['payments.read'])).map((i) => i.href);
    expect(hrefs).not.toContain('/admin/payments/settings');
  });
});

describe('payments settings — module smoke', () => {
  it('exports the settings screen', async () => {
    const mod = await import('../features/payments/settings-screen');
    expect(typeof mod.PaymentProviderSettingsScreen).toBe('function');
  });
});
