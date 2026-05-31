/**
 * Phase 2 Plan B Task 11 — E2E smoke для admin learners management.
 *
 * Контур (см. canonical-e2e-readiness.e2e.test.ts / admin-bulk-enrollment.e2e.test.ts):
 *  - Routing/permission через evaluateRouteAccess + getVisibleNavigation.
 *  - Pipeline integration: pure functions из format.ts.
 *  - Module smoke — поймать сломанные импорты.
 *
 * Без RTL (нет в зависимостях). Backend covered отдельным PR (#198).
 */

import { describe, expect, it } from 'vitest';

import { buildUpdatePayload, formatFullName, formatSnils } from '../features/learners/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const sessionWithRead: UserSession = {
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
  permissions: ['learners.read']
};

const sessionWithoutRead: UserSession = {
  ...sessionWithRead,
  permissions: ['progress.read'] // any other permission, just not learners.read
};

describe('admin learners management E2E smoke', () => {
  it('routing: /admin/learners accessible with learners.read', () => {
    expect(evaluateRouteAccess('/admin/learners', sessionWithRead)).toEqual({ kind: 'ok' });
  });

  it('routing: /admin/learners forbidden without learners.read', () => {
    expect(evaluateRouteAccess('/admin/learners', sessionWithoutRead)).toEqual({
      kind: 'forbidden'
    });
  });

  it('routing: /admin/learners redirects to login with no session', () => {
    expect(evaluateRouteAccess('/admin/learners', null)).toEqual({ kind: 'redirect-login' });
  });

  it('nav: «Ученики» visible to session with learners.read', () => {
    expect(getVisibleNavigation(sessionWithRead).map((i) => i.href)).toContain('/admin/learners');
  });

  it('nav: «Ученики» hidden without learners.read', () => {
    expect(getVisibleNavigation(sessionWithoutRead).map((i) => i.href)).not.toContain(
      '/admin/learners'
    );
  });

  it('pipeline: formatFullName assembles Russian ФИО with patronym', () => {
    expect(formatFullName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' })).toBe(
      'Иванов Иван Петрович'
    );
  });

  it('pipeline: formatFullName without middleName omits empty segment', () => {
    // exactOptionalPropertyTypes: true — omit the key entirely rather than passing undefined
    expect(formatFullName({ lastName: 'Петрова', firstName: 'Анна' })).toBe('Петрова Анна');
  });

  it('pipeline: formatSnils formats 11 digits into canonical mask', () => {
    expect(formatSnils('12345678901')).toBe('123-456-789 01');
  });

  it('pipeline: buildUpdatePayload maps empty strings to null for nullable fields', () => {
    const payload = buildUpdatePayload({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: '',
      email: '',
      snils: '111-111-111 45',
      position: '',
      organizationUnitId: '',
      learnerNo: 'L-001',
      status: 'active'
    });
    expect(payload.firstName).toBe('Иван');
    expect(payload.lastName).toBe('Иванов');
    expect(payload.middleName).toBeNull();
    expect(payload.email).toBeNull();
    expect(payload.snils).toBe('111-111-111 45');
    expect(payload.position).toBeNull();
    expect(payload.organizationUnitId).toBeNull();
    expect(payload.learnerNo).toBe('L-001');
    expect(payload.status).toBe('active');
  });

  it('smoke: LearnersListScreen module loads (no broken imports)', async () => {
    const mod = await import('../features/learners/learners-list-screen');
    expect(typeof mod.LearnersListScreen).toBe('function');
  });

  it('smoke: LearnerEditDrawer module loads (no broken imports)', async () => {
    const mod = await import('../features/learners/learner-edit-drawer');
    expect(typeof mod.LearnerEditDrawer).toBe('function');
  });
});
