import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const authorizedSession: UserSession = {
  user: {
    id: 'u_tenant_admin',
    tenantId: 'tenant_demo',
    login: 'tenant_admin',
    email: null,
    status: 'active',
    displayName: 'Tenant Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 100 },
  roles: ['tenant_admin'],
  // Журнал 343: «Документы» закрыты правом их ручек — `documents.read`. У tenant_admin оно
  // в живой базе есть; фикстура догоняет действительность, а не обходит проверку.
  permissions: ['tenant.read', 'documents.read', 'iam.manage_roles', 'auth.manage_sessions']
};

describe('auth and routing e2e scenarios (logic-level)', () => {
  it('redirects anonymous user to login for protected route', () => {
    expect(evaluateRouteAccess('/documents', null)).toEqual({ kind: 'redirect-login' });
  });

  it('allows access after login session exists', () => {
    expect(evaluateRouteAccess('/documents', authorizedSession)).toEqual({ kind: 'ok' });
  });

  it('shows forbidden for protected route without permission', () => {
    const session = { ...authorizedSession, permissions: ['tenant.read'] };
    expect(evaluateRouteAccess('/settings', session)).toEqual({ kind: 'forbidden' });
  });

  it('returns not-found for unknown route map entry', () => {
    expect(evaluateRouteAccess('/totally-missing-route', authorizedSession)).toEqual({
      kind: 'not-found'
    });
  });

  // ФТ-E5: портал заказчика открывается ТОЛЬКО правом portal.read. counterparties.read —
  // это «справочник контрагентов всего центра», представителю оно не выдаётся и портал не открывает.
  it('counterparty portal requires portal.read', () => {
    const rep = { ...authorizedSession, roles: ['counterparty_rep'], permissions: ['portal.read'] };
    expect(evaluateRouteAccess('/counterparty-portal', rep)).toEqual({ kind: 'ok' });
  });

  it('counterparty portal is forbidden with counterparties.read alone', () => {
    const staffLike = { ...authorizedSession, permissions: ['counterparties.read'] };
    expect(evaluateRouteAccess('/counterparty-portal', staffLike)).toEqual({ kind: 'forbidden' });
  });

  it('denies access after logout when session is not available anymore', () => {
    const accessBeforeLogout = evaluateRouteAccess('/users', authorizedSession);
    const accessAfterLogout = evaluateRouteAccess('/users', null);

    expect(accessBeforeLogout).toEqual({ kind: 'ok' });
    expect(accessAfterLogout).toEqual({ kind: 'redirect-login' });
  });
});
