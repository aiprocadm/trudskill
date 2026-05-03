/**
 * Приёмочный контур без браузера: фиксируем выбор канонической стратегии E2E.
 * Основная сквозная проверка домена — Nest + in-memory/backend business-flow (`business-flows.e2e.test.ts`).
 * Здесь — контроль маршрутной политики UI для ключевых зон LMS (§39 ТЗ-документ).
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const learnerSession: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: null,
    status: 'active',
    displayName: 'Learner'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['learner'],
  permissions: ['enrollments.read', 'assessment.attempts.take', 'assessment.results.read']
};

const adminReportsSession: UserSession = {
  user: {
    id: 'u_admin_reports',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's2', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['tenant.read', 'enrollments.read', 'courses.read']
};

describe('canonical E2E readiness (routing + documented backend flows)', () => {
  it('слушатель с enrollments.read проходит learner cabinet; KPI-страница требует tenant.read на UI (см. apps/backend/src/modules/mvp/business-flows.e2e.test.ts для сквозного Vitest-потока)', () => {
    expect(evaluateRouteAccess('/learner/courses', learnerSession)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/reports', learnerSession)).toEqual({ kind: 'forbidden' });

    expect(evaluateRouteAccess('/reports', adminReportsSession)).toEqual({ kind: 'ok' });
    expect(getVisibleNavigation(adminReportsSession).some((item) => item.href === '/reports')).toBe(
      true
    );
  });
});
