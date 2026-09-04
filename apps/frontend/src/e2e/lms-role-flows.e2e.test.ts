import { describe, expect, it } from 'vitest';

import {
  evaluateRouteAccess,
  getNavigationView,
  getVisibleNavigation
} from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminSession: UserSession = {
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
  permissions: [
    'tenant.read',
    'iam.manage_roles',
    'auth.manage_sessions',
    'courses.read',
    'groups.read',
    // Фаза 6 Task 1: раздел отчётов закрыт `learners.read`. У роли tenant_admin оно
    // в живой базе есть — фикстура догоняет действительность, а не обходит проверку.
    'learners.read',
    // Журнал 343: оперативная панель закрыта своим правом (0091) — у tenant_admin оно есть.
    'workspace.read'
  ]
};

describe('lms role flows', () => {
  it('admin sees enterprise routes in navigation', () => {
    const nav = getVisibleNavigation(adminSession).map((item) => item.href);
    expect(nav).toContain('/audit');
    expect(nav).toContain('/reports');
    expect(nav).toContain('/workspace');
  });

  it('anonymous user has no access to protected enterprise modules', () => {
    expect(evaluateRouteAccess('/audit', null)).toEqual({ kind: 'redirect-login' });
    expect(evaluateRouteAccess('/gov-export', null)).toEqual({ kind: 'redirect-login' });
  });

  it('authenticated user can access core lms modules with permissions', () => {
    expect(evaluateRouteAccess('/courses', adminSession)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/groups', adminSession)).toEqual({ kind: 'ok' });
  });

  // IA-013: путь роли начинается с меню. Ежедневные разделы администратора обязаны быть
  // видны сразу, иначе короткое меню экономит клики не тому, кому нужно.
  it('администратор видит группы и отчёты в главном меню', () => {
    const main = getNavigationView(adminSession).main.map((item) => item.href);
    expect(main).toContain('/groups');
    expect(main).toContain('/reports');
  });
});
