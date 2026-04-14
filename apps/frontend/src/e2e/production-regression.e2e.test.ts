import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[], roles: string[] = []): UserSession => ({
  user: {
    id: 'u_demo',
    tenantId: 'tenant_demo',
    login: 'demo',
    email: null,
    status: 'active',
    displayName: 'Demo'
  },
  tokens: { accessToken: 'token', sessionId: 'sid', expiresIn: 600 },
  roles,
  permissions
});

describe('production regression by roles', () => {
  it('methodist has access to assessment and reports', () => {
    const methodist = buildSession(['assessment.tests.read', 'tenant.read']);
    expect(evaluateRouteAccess('/assessment', methodist)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/reports', methodist)).toEqual({ kind: 'ok' });
  });

  it('learner cannot access admin settings', () => {
    const learner = buildSession(['enrollments.read']);
    expect(evaluateRouteAccess('/learner/courses', learner)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/settings', learner)).toEqual({ kind: 'forbidden' });
  });

  it('legal/security flow gates access correctly', () => {
    const legal = buildSession(['esign.legal.read', 'esign.applications.read']);
    expect(evaluateRouteAccess('/esign/legal-log', legal)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/audit', legal)).toEqual({ kind: 'forbidden' });
  });

  it('anonymous user cannot call protected integration routes', () => {
    expect(evaluateRouteAccess('/integrations', null)).toEqual({ kind: 'redirect-login' });
    expect(evaluateRouteAccess('/gov-export', null)).toEqual({ kind: 'redirect-login' });
  });
});
