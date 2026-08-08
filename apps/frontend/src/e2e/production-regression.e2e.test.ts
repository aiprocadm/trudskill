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
  /*
   * Фаза 6 Task 1. Раньше здесь утверждалось, что методисту открыты и проверка знаний,
   * и отчёты. По интерфейсу так и было (страница требовала `tenant.read`), но пользы
   * от этого не было никакой: у роли `methodist` в живой базе нет ни `enrollments.read`,
   * ни `learners.read`, поэтому КАЖДЫЙ запрос отчёта возвращал ему отказ. Страница
   * открывалась и упиралась в пустоту.
   *
   * Теперь интерфейс говорит то же, что и сервер. Нужен ли методисту доступ к отчётам —
   * вопрос продукта: это выдача права миграцией, а не правка гейта (см. §5.252).
   */
  it('методисту открыта проверка знаний, но не отчёты центра (как и на сервере)', () => {
    const methodist = buildSession(['assessment.tests.read', 'tenant.read']);
    expect(evaluateRouteAccess('/assessment', methodist)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/reports', methodist)).toEqual({ kind: 'forbidden' });
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
