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
  /*
   * Фаза 6 Task 1: НАСТОЯЩИЙ набор прав роли `learner` из живой базы
   * (`iam.role_permissions`, миграции 0038/0055/0066/…), а не три права «на глазок».
   *
   * Прежняя выдумка из трёх прав делала тест зелёным и слепым: в ней не было
   * `tenant.read`, поэтому «слушателю запрещены отчёты» подтверждалось само собой.
   * Вживую `tenant.read` у слушателя есть — и раздел отчётов по всему центру был ему
   * открыт (закрыто в этой же задаче правом `learners.read`).
   */
  permissions: [
    'assessment.assignments.read',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.results.read',
    'assessment.submissions.submit',
    'assessment.tests.read',
    'courses.read',
    'enrollments.read',
    'identity.submit',
    'materials.read',
    'payments.self_purchase',
    'proctoring.submit',
    'progress.read',
    'progress.recalculate',
    'tenant.read',
    'video.read',
    'webinars.attend'
  ]
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
  // `learners.read` — то самое право, которым с Фазы 6 закрыт раздел отчётов; у роли
  // tenant_admin в живой базе оно есть, поэтому фикстура остаётся правдой, а не удобством.
  permissions: ['tenant.read', 'enrollments.read', 'courses.read', 'learners.read']
};

describe('canonical E2E readiness (routing + documented backend flows)', () => {
  it('слушатель проходит в свой кабинет, но не в отчёты центра (см. apps/backend/src/modules/mvp/business-flows.e2e.test.ts для сквозного Vitest-потока)', () => {
    expect(evaluateRouteAccess('/learner/courses', learnerSession)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/reports', learnerSession)).toEqual({ kind: 'forbidden' });

    expect(evaluateRouteAccess('/reports', adminReportsSession)).toEqual({ kind: 'ok' });
    expect(getVisibleNavigation(adminReportsSession).some((item) => item.href === '/reports')).toBe(
      true
    );
  });

  /*
   * Фаза 6 Task 1: сторож утечки. С НАСТОЯЩИМ набором прав слушателя раздел отчётов был
   * ему открыт целиком — вплоть до конструктора, выгружающего ФИО и СНИЛС всего центра
   * (до 50 000 строк). Проверяем и доступ, и отсутствие пунктов в меню: ссылка, ведущая
   * в отказ, — это тоже дефект, человек видит то, чего ему не положено даже знать.
   */
  it('слушателю закрыты все экраны отчётов центра, и их нет у него в меню', () => {
    for (const path of ['/reports', '/admin/analytics', '/admin/reports/builder']) {
      expect(evaluateRouteAccess(path, learnerSession), path).toEqual({ kind: 'forbidden' });
    }
    const learnerNav = getVisibleNavigation(learnerSession).map((item) => item.href);
    expect(learnerNav).not.toContain('/reports');
    expect(learnerNav).not.toContain('/admin/analytics');
    expect(learnerNav).not.toContain('/admin/reports/builder');
  });
});
