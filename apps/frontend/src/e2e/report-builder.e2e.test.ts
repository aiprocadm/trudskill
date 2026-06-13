/**
 * Phase 10 Track A — E2E smoke для конструктора Excel-отчётов.
 * Конвенция проекта: routing/permission через evaluateRouteAccess + getVisibleNavigation,
 * pure-helper integration, dynamic-import smoke экрана. Реального React mount нет (RTL не в deps).
 */
import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';
import { base64ToBytes, canRun, toRequest } from '../features/report-builder/report-builder';

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

describe('report builder E2E smoke', () => {
  it('route /admin/reports/builder requires enrollments.read', () => {
    expect(evaluateRouteAccess('/admin/reports/builder', admin)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/reports/builder', noPerms)).toEqual({ kind: 'forbidden' });
    expect(evaluateRouteAccess('/admin/reports/builder', null)).toEqual({ kind: 'redirect-login' });
  });

  it('nav «Конструктор отчётов» visible only with enrollments.read', () => {
    expect(getVisibleNavigation(admin).map((i) => i.href)).toContain('/admin/reports/builder');
    expect(getVisibleNavigation(noPerms).map((i) => i.href)).not.toContain(
      '/admin/reports/builder'
    );
  });

  it('pure helpers integrate', () => {
    expect(canRun({ entityKey: 'learners', selectedFields: ['fullName'], filters: [] })).toBe(true);
    expect(
      toRequest({
        entityKey: 'enrollments',
        selectedFields: ['status'],
        filters: [{ key: 'status', value: '' }]
      }).filters
    ).toBeUndefined();
    expect(Array.from(base64ToBytes('UEs='))).toEqual([0x50, 0x4b]);
  });

  it('screen module imports without crashing', async () => {
    const mod = await import('../features/report-builder/screens');
    expect(typeof mod.ReportBuilderScreen).toBe('function');
  });
});
