/**
 * Phase 2 Plan C Task 14 — E2E smoke для admin clients management.
 *
 * Контур по конвенциям проекта (Plan A/B references):
 *  - Routing/permission через evaluateRouteAccess.
 *  - Nav visibility через getVisibleNavigation.
 *  - Pure-function pipeline integration для форматтеров (buildClientUpdatePayload и т.п.).
 *  - Dynamic-import smoke для каждого экрана и dialog'а, чтобы поймать сломанные импорты.
 *
 * Без React mount (RTL не в зависимостях). Backend permission-boundary и доменные
 * инварианты покрыты HTTP integration в PR #202.
 */

import { describe, expect, it } from 'vitest';

import {
  CLIENT_STATUS_LABEL,
  buildClientCreatePayload,
  buildClientUpdatePayload,
  formatInn,
  formatPhone,
  formatProgressLabel
} from '../features/clients/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const sessionAdmin: UserSession = {
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
  permissions: ['counterparties.read']
};

const sessionWithout: UserSession = {
  ...sessionAdmin,
  permissions: ['enrollments.read']
};

describe('admin clients management — routing', () => {
  it('grants /admin/clients with counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients', sessionAdmin)).toEqual({ kind: 'ok' });
  });

  it('denies /admin/clients without counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients', sessionWithout)).toEqual({ kind: 'forbidden' });
  });

  it('grants /admin/clients/:id detail with counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients/cp-1', sessionAdmin)).toEqual({ kind: 'ok' });
  });

  it('redirects to login when no session', () => {
    expect(evaluateRouteAccess('/admin/clients', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('admin clients management — navigation', () => {
  it('shows «Компании» entry for user with counterparties.read', () => {
    expect(getVisibleNavigation(sessionAdmin).map((i) => i.href)).toContain('/admin/clients');
  });

  it('hides «Компании» entry without counterparties.read', () => {
    expect(getVisibleNavigation(sessionWithout).map((i) => i.href)).not.toContain('/admin/clients');
  });
});

describe('admin clients management — formatters pipeline integration', () => {
  it('formatInn / formatPhone / formatProgressLabel produce expected display strings', () => {
    expect(formatInn('7707083893')).toBe('7707083893');
    expect(formatInn(undefined)).toBe('—');
    expect(formatPhone('74951234567')).toBe('+7 (495) 123-45-67');
    expect(formatPhone(undefined)).toBe('—');
    expect(formatProgressLabel(3, 4)).toBe('3 из 4 (75%)');
    expect(formatProgressLabel(0, 0)).toBe('0 из 0');
  });

  it('buildClientUpdatePayload nullifies empty fields, preserves filled, normalizes status', () => {
    const payload = buildClientUpdatePayload({
      code: 'X',
      name: 'X',
      legalName: '',
      inn: '7707083893',
      kpp: '',
      contactEmail: 'a@x.ru',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'archived'
    });
    expect(payload.inn).toBe('7707083893');
    expect(payload.contactEmail).toBe('a@x.ru');
    expect(payload.legalName).toBeNull();
    expect(payload.kpp).toBeNull();
    expect(payload.status).toBe('archived');
  });

  it('buildClientCreatePayload omits empty fields (no nulls in POST)', () => {
    const payload = buildClientCreatePayload({
      code: 'C',
      name: 'N',
      legalName: '',
      inn: '',
      kpp: '',
      contactEmail: '',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'active'
    });
    expect(payload).toEqual({ code: 'C', name: 'N' });
  });

  it('CLIENT_STATUS_LABEL maps statuses to Russian display strings', () => {
    expect(CLIENT_STATUS_LABEL.active).toBe('Активна');
    expect(CLIENT_STATUS_LABEL.archived).toBe('В архиве');
  });
});

describe('admin clients management — module smoke', () => {
  it('loads ClientsListScreen', async () => {
    const mod = await import('../features/clients/clients-list-screen');
    expect(typeof mod.ClientsListScreen).toBe('function');
  });

  it('loads ClientDetailScreen', async () => {
    const mod = await import('../features/clients/client-detail-screen');
    expect(typeof mod.ClientDetailScreen).toBe('function');
  });

  it('loads ClientEditDrawer', async () => {
    const mod = await import('../features/clients/client-edit-drawer');
    expect(typeof mod.ClientEditDrawer).toBe('function');
  });

  it('loads GroupProgressSection', async () => {
    const mod = await import('../features/clients/group-progress-section');
    expect(typeof mod.GroupProgressSection).toBe('function');
  });

  it('loads GroupCounterpartyPicker (standalone, awaits V1.1 integration)', async () => {
    const mod = await import('../features/clients/group-counterparty-picker');
    expect(typeof mod.GroupCounterpartyPicker).toBe('function');
  });
});
