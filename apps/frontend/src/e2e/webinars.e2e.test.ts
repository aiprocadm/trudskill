/**
 * E2E smoke for Phase 8 webinar pages — routing/permission via evaluateRouteAccess +
 * getVisibleNavigation, plus dynamic-import smoke for the screens module. No React mount
 * (RTL is not a dependency) — matches the convention in payments.e2e.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithRead: UserSession = {
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
  permissions: ['webinars.read', 'webinars.configure']
};

const adminWithout: UserSession = { ...adminWithRead, permissions: [] };

// Read-only admin: has webinars.read but NOT webinars.configure — must NOT reach settings.
const adminReadOnly: UserSession = { ...adminWithRead, permissions: ['webinars.read'] };

const learnerWithAttend: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: null,
    status: 'active',
    displayName: 'Learner'
  },
  tokens: { accessToken: 'b', sessionId: 's2', expiresIn: 1000 },
  roles: ['learner'],
  permissions: ['webinars.attend']
};

const learnerWithout: UserSession = { ...learnerWithAttend, permissions: [] };

describe('webinars — /admin/webinars routing', () => {
  it('allowed with webinars.read', () => {
    expect(evaluateRouteAccess('/admin/webinars', adminWithRead)).toEqual({ kind: 'ok' });
  });

  it('forbidden with empty permissions', () => {
    expect(evaluateRouteAccess('/admin/webinars', adminWithout)).toEqual({ kind: 'forbidden' });
  });

  it('redirect-login when no session', () => {
    expect(evaluateRouteAccess('/admin/webinars', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('webinars — /admin/webinars/settings routing', () => {
  it('allowed with webinars.configure', () => {
    expect(evaluateRouteAccess('/admin/webinars/settings', adminWithRead)).toEqual({ kind: 'ok' });
  });

  it('forbidden for a learner with only webinars.attend', () => {
    expect(evaluateRouteAccess('/admin/webinars/settings', learnerWithAttend)).toEqual({
      kind: 'forbidden'
    });
  });

  it('forbidden for an admin with only webinars.read (settings needs configure)', () => {
    // Guards against prefix-match ordering: `/admin/webinars` must not capture the settings route.
    expect(evaluateRouteAccess('/admin/webinars/settings', adminReadOnly)).toEqual({
      kind: 'forbidden'
    });
  });

  it('admin route itself is reachable with only webinars.read', () => {
    expect(evaluateRouteAccess('/admin/webinars', adminReadOnly)).toEqual({ kind: 'ok' });
  });
});

describe('webinars — /learner/webinars routing', () => {
  it('allowed with webinars.attend', () => {
    expect(evaluateRouteAccess('/learner/webinars', learnerWithAttend)).toEqual({ kind: 'ok' });
  });

  it('forbidden with empty permissions', () => {
    expect(evaluateRouteAccess('/learner/webinars', learnerWithout)).toEqual({ kind: 'forbidden' });
  });

  it('redirect-login when no session', () => {
    expect(evaluateRouteAccess('/learner/webinars', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('webinars — navigation visibility', () => {
  it('«Вебинары» (/admin/webinars) visible only with webinars.read', () => {
    expect(getVisibleNavigation(adminWithRead).map((i) => i.href)).toContain('/admin/webinars');
    expect(getVisibleNavigation(adminWithout).map((i) => i.href)).not.toContain('/admin/webinars');
  });

  it('«Мои вебинары» (/learner/webinars) visible only with webinars.attend', () => {
    expect(getVisibleNavigation(learnerWithAttend).map((i) => i.href)).toContain(
      '/learner/webinars'
    );
    expect(getVisibleNavigation(learnerWithout).map((i) => i.href)).not.toContain(
      '/learner/webinars'
    );
  });
});

describe('webinars — module smoke', () => {
  it('screens module exports the three screens', async () => {
    const mod = await import('../features/webinars/screens');
    expect(typeof mod.WebinarsAdminScreen).toBe('function');
    expect(typeof mod.WebinarProviderSettingsScreen).toBe('function');
    expect(typeof mod.MyWebinarsScreen).toBe('function');
  });
});
