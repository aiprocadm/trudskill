/**
 * Минздрав-НМО export route/permission + module E2E smoke (Phase 6).
 *
 * Конвенции проекта: routing/permission через evaluateRouteAccess. Без React mount
 * (RTL не в зависимостях). Backend-логика покрыта юнит- и HTTP integration-тестами.
 * НМО делит страницу /gov-export и право regulatory.export.read с ОТ/ФРДО-выгрузкой.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[]): UserSession => ({
  user: {
    id: 'u_nmo',
    tenantId: 'tenant_demo',
    login: 'nmo_user',
    email: null,
    status: 'active',
    displayName: 'NMO User'
  },
  tokens: { accessToken: 'tok', sessionId: 'sid', expiresIn: 1000 },
  roles: [],
  permissions
});

describe('Минздрав-НМО export route/permission + module e2e smoke', () => {
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

  it('smoke: gov-export api exposes НМО functions (no broken imports)', async () => {
    const mod = await import('../features/gov-export/api');
    expect(typeof mod.govExportApi.createNmoExport).toBe('function');
    expect(typeof mod.govExportApi.listNmoBatches).toBe('function');
    expect(typeof mod.govExportApi.getNmoBatchFileUrl).toBe('function');
  });

  it('smoke: gov-export hooks expose useNmoBatches (no broken imports)', async () => {
    const mod = await import('../features/gov-export/hooks');
    expect(typeof mod.useNmoBatches).toBe('function');
  });
});
