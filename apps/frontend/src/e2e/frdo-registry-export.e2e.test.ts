/**
 * ФИС ФРДО export route/permission + module E2E smoke (Wave 2 sub-goal A).
 *
 * Конвенции проекта: routing/permission через evaluateRouteAccess. Без React mount
 * (RTL не в зависимостях). Backend-логика покрыта юнит- и HTTP integration-тестами.
 * ФРДО делит страницу /gov-export и право regulatory.export.read с ОТ-выгрузкой.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[]): UserSession => ({
  user: {
    id: 'u_frdo',
    tenantId: 'tenant_demo',
    login: 'frdo_user',
    email: null,
    status: 'active',
    displayName: 'FRDO User'
  },
  tokens: { accessToken: 'tok', sessionId: 'sid', expiresIn: 1000 },
  roles: [],
  permissions
});

describe('ФИС ФРДО export route/permission + module e2e smoke', () => {
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

  it('smoke: gov-export api exposes ФРДО functions (no broken imports)', async () => {
    const mod = await import('../features/gov-export/api');
    expect(typeof mod.govExportApi.createFrdoRegistryExport).toBe('function');
    expect(typeof mod.govExportApi.listFrdoBatches).toBe('function');
    expect(typeof mod.govExportApi.getFrdoBatchFileUrl).toBe('function');
  });

  it('smoke: gov-export hooks expose useFrdoRegistryBatches (no broken imports)', async () => {
    const mod = await import('../features/gov-export/hooks');
    expect(typeof mod.useFrdoRegistryBatches).toBe('function');
  });
});
