/**
 * ЕИСОТ «лица на тестирование» export route/permission + module E2E smoke (Wave 2 sub-goal C).
 *
 * Конвенции проекта: routing/permission через evaluateRouteAccess. Без React mount
 * (RTL не в зависимостях). Backend-логика покрыта юнит- и HTTP integration-тестами.
 * ЕИСОТ делит страницу /gov-export и право regulatory.export.read с ОТ/ФРДО-выгрузками.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[]): UserSession => ({
  user: {
    id: 'u_eisot',
    tenantId: 'tenant_demo',
    login: 'eisot_user',
    email: null,
    status: 'active',
    displayName: 'EISOT User'
  },
  tokens: { accessToken: 'tok', sessionId: 'sid', expiresIn: 1000 },
  roles: [],
  permissions
});

describe('ЕИСОТ testing-roster export route/permission + module e2e smoke', () => {
  it('user WITH regulatory.export.read can access /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', buildSession(['regulatory.export.read']))).toEqual({
      kind: 'ok'
    });
  });

  it('user WITHOUT regulatory.export.read is forbidden on /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', buildSession(['tenant.read']))).toEqual({
      kind: 'forbidden'
    });
  });

  it('smoke: gov-export api exposes ЕИСОТ functions (no broken imports)', async () => {
    const mod = await import('../features/gov-export/api');
    expect(typeof mod.govExportApi.createEisotTestingExport).toBe('function');
    expect(typeof mod.govExportApi.listEisotTestingBatches).toBe('function');
    expect(typeof mod.govExportApi.getEisotTestingBatchFileUrl).toBe('function');
  });

  it('smoke: gov-export hooks expose useEisotTestingBatches (no broken imports)', async () => {
    const mod = await import('../features/gov-export/hooks');
    expect(typeof mod.useEisotTestingBatches).toBe('function');
  });
});
