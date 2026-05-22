import { describe, expect, it } from 'vitest';

import { getActiveRole, getAvailableRoles } from './role-switcher';

import type { UserSession } from '../../entities/session/model';

const buildSession = (roles: string[]): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 't1',
    login: 'u',
    email: null,
    displayName: 'U',
    status: 'active'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 100 },
  roles,
  permissions: []
});

describe('getAvailableRoles', () => {
  it('returns empty array for null session', () => {
    expect(getAvailableRoles(null)).toEqual([]);
  });

  it('returns empty array when user has only one role', () => {
    expect(getAvailableRoles(buildSession(['learner']))).toEqual([]);
  });

  it('normalizes student → learner and admin → tenant_admin', () => {
    const options = getAvailableRoles(buildSession(['student', 'admin']));
    expect(options.map((o) => o.code)).toEqual(['learner', 'tenant_admin']);
  });

  it('orders learner first, then teacher, admin, platform_admin', () => {
    const options = getAvailableRoles(buildSession(['platform_admin', 'teacher', 'learner']));
    expect(options.map((o) => o.code)).toEqual(['learner', 'teacher', 'platform_admin']);
  });

  it('deduplicates roles after normalization', () => {
    const options = getAvailableRoles(buildSession(['student', 'learner']));
    expect(options).toEqual([]);
  });

  it('maps each role to its dashboard href', () => {
    const options = getAvailableRoles(buildSession(['learner', 'teacher', 'tenant_admin']));
    expect(options.find((o) => o.code === 'learner')?.href).toBe('/learner');
    expect(options.find((o) => o.code === 'teacher')?.href).toBe('/teacher/grading-center');
    expect(options.find((o) => o.code === 'tenant_admin')?.href).toBe('/admin/cockpit');
  });
});

describe('getActiveRole', () => {
  it('returns the requested role if it is available', () => {
    expect(getActiveRole(buildSession(['learner', 'teacher']), 'teacher')).toBe('teacher');
  });

  it('falls back to the first available role when requested is not available', () => {
    expect(getActiveRole(buildSession(['learner', 'teacher']), 'platform_admin')).toBe('learner');
  });

  it('returns learner as final fallback when no roles are available', () => {
    expect(getActiveRole(null, null)).toBe('learner');
  });
});
