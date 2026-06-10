/**
 * Phase 4 Plan A Task 11 — E2E smoke для identity verification (admin queue + detail + learner).
 *
 * Контур по конвенциям проекта (см. admin-bulk-enrollment.e2e.test.ts):
 *  - Routing/permission через evaluateRouteAccess + getVisibleNavigation.
 *  - Dynamic-import smoke для каждого экрана.
 *
 * Реальный React mount нет (RTL не в зависимостях). Backend permission-boundary покрыт
 * HTTP integration tests; бизнес-логика — service unit-тестами.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithIdentityRead: UserSession = {
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
  permissions: ['identity.read']
};

const adminWithout: UserSession = {
  ...adminWithIdentityRead,
  permissions: []
};

const adminUnrelated: UserSession = {
  ...adminWithIdentityRead,
  permissions: ['courses.read']
};

const learnerWithSubmit: UserSession = {
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
  permissions: ['identity.submit']
};

const learnerWithout: UserSession = {
  ...learnerWithSubmit,
  permissions: []
};

describe('identity verification — routing', () => {
  it('/admin/identity-verifications: allowed with identity.read', () => {
    expect(evaluateRouteAccess('/admin/identity-verifications', adminWithIdentityRead)).toEqual({
      kind: 'ok'
    });
  });

  it('/admin/identity-verifications: forbidden with empty permissions', () => {
    expect(evaluateRouteAccess('/admin/identity-verifications', adminWithout)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/identity-verifications: forbidden with unrelated permission courses.read', () => {
    expect(evaluateRouteAccess('/admin/identity-verifications', adminUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/identity-verifications: redirect-login when no session', () => {
    expect(evaluateRouteAccess('/admin/identity-verifications', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('/admin/identity-verifications/[id] detail: allowed with identity.read', () => {
    expect(
      evaluateRouteAccess('/admin/identity-verifications/iv-abc-123', adminWithIdentityRead)
    ).toEqual({ kind: 'ok' });
  });

  it('/admin/identity-verifications/[id] detail: forbidden without identity.read', () => {
    expect(evaluateRouteAccess('/admin/identity-verifications/iv-abc-123', adminUnrelated)).toEqual(
      { kind: 'forbidden' }
    );
  });

  it('/learner/identity: allowed with identity.submit', () => {
    expect(evaluateRouteAccess('/learner/identity', learnerWithSubmit)).toEqual({ kind: 'ok' });
  });

  it('/learner/identity: forbidden without identity.submit', () => {
    expect(evaluateRouteAccess('/learner/identity', learnerWithout)).toEqual({
      kind: 'forbidden'
    });
  });
});

describe('identity verification — navigation visibility', () => {
  it('«Идентификация» visible only with identity.read', () => {
    expect(getVisibleNavigation(adminWithIdentityRead).map((i) => i.href)).toContain(
      '/admin/identity-verifications'
    );
    expect(getVisibleNavigation(adminUnrelated).map((i) => i.href)).not.toContain(
      '/admin/identity-verifications'
    );
  });

  it('«Подтверждение личности» visible only with identity.submit', () => {
    expect(getVisibleNavigation(learnerWithSubmit).map((i) => i.href)).toContain(
      '/learner/identity'
    );
    expect(getVisibleNavigation(learnerWithout).map((i) => i.href)).not.toContain(
      '/learner/identity'
    );
  });
});

describe('identity verification — module smoke', () => {
  it('screens module loads and exports all three screens', async () => {
    const mod = await import('../features/identity-verification/screens');
    expect(typeof mod.LearnerIdentityScreen).toBe('function');
    expect(typeof mod.AdminIdentityQueueScreen).toBe('function');
    expect(typeof mod.AdminIdentityDetailScreen).toBe('function');
  });

  it('hooks module loads', async () => {
    const mod = await import('../features/identity-verification/hooks');
    expect(typeof mod.useIdentityQueue).toBe('function');
    expect(typeof mod.useIdentityDetail).toBe('function');
    expect(typeof mod.useIdentityReview).toBe('function');
    expect(typeof mod.useMyIdentityVerification).toBe('function');
  });

  it('format module loads', async () => {
    const mod = await import('../features/identity-verification/format');
    expect(typeof mod.formatIdentityStatus).toBe('function');
    expect(typeof mod.formatDateShort).toBe('function');
    expect(typeof mod.IDENTITY_STATUS_LABELS).toBe('object');
  });
});
