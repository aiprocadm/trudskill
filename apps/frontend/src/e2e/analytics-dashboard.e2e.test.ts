/**
 * Phase 9 Plan B — E2E smoke для админ-дашборда аналитики.
 * Конвенция проекта: routing/permission через evaluateRouteAccess + getVisibleNavigation,
 * pure-helper integration, dynamic-import smoke экрана. Реального React mount нет (RTL не в deps).
 */
import { describe, expect, it } from 'vitest';

import { computeBarChartLayout, formatPercent } from '../features/analytics/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const admin: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 't1',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['enrollments.read']
};
const noPerms: UserSession = { ...admin, permissions: [] };

describe('analytics dashboard E2E smoke', () => {
  it('route /admin/analytics requires enrollments.read', () => {
    expect(evaluateRouteAccess('/admin/analytics', admin)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/analytics', noPerms)).toEqual({ kind: 'forbidden' });
    expect(evaluateRouteAccess('/admin/analytics', null)).toEqual({ kind: 'redirect-login' });
  });

  it('nav «Аналитика» visible only with enrollments.read', () => {
    expect(getVisibleNavigation(admin).map((i) => i.href)).toContain('/admin/analytics');
    expect(getVisibleNavigation(noPerms).map((i) => i.href)).not.toContain('/admin/analytics');
  });

  it('pure helpers integrate', () => {
    expect(formatPercent(0.5)).toBe('50.0 %');
    expect(
      computeBarChartLayout([{ label: 'A', value: 1 }], { width: 10, barHeight: 4, gap: 1 }).bars[0]
        ?.width
    ).toBe(10);
  });

  it('screen module imports without crashing', async () => {
    const mod = await import('../features/analytics/screens');
    expect(typeof mod.AnalyticsDashboardScreen).toBe('function');
  });
});
