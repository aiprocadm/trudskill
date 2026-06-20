/**
 * Task 14 — E2E smoke для learner payment history page + pay button.
 *
 * Convention (см. identity-verification.e2e.test.ts):
 *  - Routing/permission через evaluateRouteAccess + getVisibleNavigation.
 *  - Dynamic-import smoke для экранов и хуков.
 *  - Реальный React mount нет (RTL не в зависимостях).
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithPaymentsRead: UserSession = {
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
  permissions: ['payments.read']
};

const adminWithout: UserSession = {
  ...adminWithPaymentsRead,
  permissions: []
};

const learnerWithSelfPurchase: UserSession = {
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
  permissions: ['payments.self_purchase']
};

const learnerWithout: UserSession = {
  ...learnerWithSelfPurchase,
  permissions: []
};

const learnerUnrelated: UserSession = {
  ...learnerWithSelfPurchase,
  permissions: ['enrollments.read']
};

describe('payments — /admin/orders routing', () => {
  it('allowed with payments.read', () => {
    expect(evaluateRouteAccess('/admin/orders', adminWithPaymentsRead)).toEqual({ kind: 'ok' });
  });

  it('forbidden with empty permissions', () => {
    expect(evaluateRouteAccess('/admin/orders', adminWithout)).toEqual({ kind: 'forbidden' });
  });

  it('redirect-login when no session', () => {
    expect(evaluateRouteAccess('/admin/orders', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('payments — /learner/payments routing', () => {
  it('allowed with payments.self_purchase', () => {
    expect(evaluateRouteAccess('/learner/payments', learnerWithSelfPurchase)).toEqual({
      kind: 'ok'
    });
  });

  it('forbidden with empty permissions', () => {
    expect(evaluateRouteAccess('/learner/payments', learnerWithout)).toEqual({
      kind: 'forbidden'
    });
  });

  it('forbidden with unrelated permission enrollments.read', () => {
    expect(evaluateRouteAccess('/learner/payments', learnerUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('redirect-login when no session', () => {
    expect(evaluateRouteAccess('/learner/payments', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('payments — navigation visibility', () => {
  it('«Заказы» (admin/orders) visible only with payments.read', () => {
    expect(getVisibleNavigation(adminWithPaymentsRead).map((i) => i.href)).toContain(
      '/admin/orders'
    );
    expect(getVisibleNavigation(adminWithout).map((i) => i.href)).not.toContain('/admin/orders');
  });

  it('«Мои оплаты» (/learner/payments) visible only with payments.self_purchase', () => {
    expect(getVisibleNavigation(learnerWithSelfPurchase).map((i) => i.href)).toContain(
      '/learner/payments'
    );
    expect(getVisibleNavigation(learnerWithout).map((i) => i.href)).not.toContain(
      '/learner/payments'
    );
    expect(getVisibleNavigation(learnerUnrelated).map((i) => i.href)).not.toContain(
      '/learner/payments'
    );
  });

  it('learner with self_purchase sees «payments» label in nav', () => {
    const nav = getVisibleNavigation(learnerWithSelfPurchase);
    const labels = nav.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes('оплат'))).toBe(true);
  });
});

describe('payments — module smoke', () => {
  it('screens module exports MyPaymentsScreen and OrdersScreen', async () => {
    const mod = await import('../features/payments/screens');
    expect(typeof mod.MyPaymentsScreen).toBe('function');
    expect(typeof mod.OrdersScreen).toBe('function');
  });

  it('hooks module exports useMyOrders and useOrders', async () => {
    const mod = await import('../features/payments/hooks');
    expect(typeof mod.useMyOrders).toBe('function');
    expect(typeof mod.useOrders).toBe('function');
    expect(typeof mod.useOrderMutations).toBe('function');
  });

  it('api module exports payOrder and listMyOrders', async () => {
    const mod = await import('../features/payments/api');
    expect(typeof mod.payOrder).toBe('function');
    expect(typeof mod.listMyOrders).toBe('function');
  });
});
