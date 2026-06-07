/**
 * Phase 5C — E2E smoke для очереди «Нужна переаттестация».
 *
 * По конвенциям проекта (см. admin-bulk-enrollment.e2e.test.ts): routing/permission
 * через evaluateRouteAccess + getVisibleNavigation + smoke-import экрана. Реальный
 * React mount нет (RTL не в зависимостях); бизнес-логика покрыта unit/contract-тестами.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithRecert: UserSession = {
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
  permissions: ['recertification.read', 'recertification.write']
};

const adminWithout: UserSession = {
  ...adminWithRecert,
  permissions: ['courses.read']
};

describe('recertification queue E2E smoke', () => {
  it('route: /admin/recertification needs recertification.read', () => {
    expect(evaluateRouteAccess('/admin/recertification', adminWithRecert)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/recertification', adminWithout)).toEqual({
      kind: 'forbidden'
    });
    expect(evaluateRouteAccess('/admin/recertification', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('nav: «Переаттестация» visible only with recertification.read', () => {
    expect(getVisibleNavigation(adminWithRecert).map((i) => i.href)).toContain(
      '/admin/recertification'
    );
    expect(getVisibleNavigation(adminWithout).map((i) => i.href)).not.toContain(
      '/admin/recertification'
    );
  });

  it('smoke: RecertificationQueueScreen module loads (no broken imports)', async () => {
    const mod = await import('../features/recertification/screens');
    expect(typeof mod.RecertificationQueueScreen).toBe('function');
  });

  it('smoke: hooks module loads', async () => {
    const mod = await import('../features/recertification/hooks');
    expect(typeof mod.useRecertificationQueue).toBe('function');
    expect(typeof mod.useRecertificationMutations).toBe('function');
  });
});
