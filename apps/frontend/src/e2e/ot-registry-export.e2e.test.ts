/**
 * Task 17 — ОТ-registry export route/permission E2E smoke.
 *
 * Конвенции проекта: routing/permission через evaluateRouteAccess +
 * getVisibleNavigation. Без React mount (RTL не в зависимостях).
 * Backend-логика покрыта юнит- и HTTP integration-тестами.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[], roles: string[] = []): UserSession => ({
  user: {
    id: 'u_gov_export',
    tenantId: 'tenant_demo',
    login: 'gov_export_user',
    email: null,
    status: 'active',
    displayName: 'Gov Export User'
  },
  tokens: { accessToken: 'tok', sessionId: 'sid', expiresIn: 1000 },
  roles,
  permissions
});

const withExportPerm = buildSession(['regulatory.export.read']);
const withoutExportPerm = buildSession(['tenant.read']);

describe('ОТ registry export route/permission e2e smoke', () => {
  it('user WITH regulatory.export.read can access /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', withExportPerm)).toEqual({ kind: 'ok' });
  });

  it('user WITHOUT regulatory.export.read is forbidden on /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', withoutExportPerm)).toEqual({ kind: 'forbidden' });
  });

  it('anonymous user is redirected to login from /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', null)).toEqual({ kind: 'redirect-login' });
  });

  it('«Госвыгрузки» appears in navigation for user WITH regulatory.export.read', () => {
    const nav = getVisibleNavigation(withExportPerm).map((item) => item.href);
    expect(nav).toContain('/gov-export');
  });

  it('«Госвыгрузки» does NOT appear in navigation for user WITHOUT regulatory.export.read', () => {
    const nav = getVisibleNavigation(withoutExportPerm).map((item) => item.href);
    expect(nav).not.toContain('/gov-export');
  });

  it('smoke: gov-export api module loads (no broken imports)', async () => {
    const mod = await import('../features/gov-export/api');
    expect(typeof mod.govExportApi.createOtRegistryExport).toBe('function');
    expect(typeof mod.govExportApi.listBatches).toBe('function');
    expect(typeof mod.govExportApi.getBatchFileUrl).toBe('function');
    expect(typeof mod.govExportApi.importResponse).toBe('function');
  });

  it('smoke: gov-export hooks module loads (no broken imports)', async () => {
    const mod = await import('../features/gov-export/hooks');
    expect(typeof mod.useOtRegistryBatches).toBe('function');
    expect(typeof mod.useOtTrainingPrograms).toBe('function');
  });
});
