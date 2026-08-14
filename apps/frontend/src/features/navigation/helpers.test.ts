import { describe, expect, it } from 'vitest';

import {
  evaluateRouteAccess,
  getNavigationView,
  getVisibleNavigation,
  resolveRouteMeta
} from './helpers';
import { navigationModel } from './model';

import type { UserSession } from '../../entities/session/model';

const adminSession: UserSession = {
  user: {
    id: 'u_tenant_admin',
    tenantId: 'tenant_demo',
    login: 'tenant_admin',
    email: null,
    status: 'active',
    displayName: 'Tenant Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: [
    'auth.manage_sessions',
    'iam.manage_roles',
    'courses.read',
    'counterparties.read',
    'directions.read',
    'groups.read',
    'enrollments.read'
  ]
};

describe('navigation helpers', () => {
  it('redirects anonymous users from protected route', () => {
    expect(evaluateRouteAccess('/users', null)).toEqual({ kind: 'redirect-login' });
  });

  it('returns forbidden when user has no permission', () => {
    const limited = { ...adminSession, permissions: ['courses.read'] };
    expect(evaluateRouteAccess('/audit', limited)).toEqual({ kind: 'forbidden' });
  });

  it('filters navigation by permissions', () => {
    const limited = { ...adminSession, permissions: ['courses.read'] };
    const visible = getVisibleNavigation(limited).map((item) => item.href);
    expect(visible).toContain('/courses');
    expect(visible).not.toContain('/audit');
  });

  it('resolves nested route metadata using route patterns', () => {
    expect(resolveRouteMeta('/users/create')?.requiredPermissions).toEqual(['iam.manage_roles']);
  });

  it('resolves workspace route metadata', () => {
    expect(resolveRouteMeta('/workspace')?.requiredPermissions).toEqual(['tenant.read']);
  });

  it('normalizes route with query params and trailing slash', () => {
    expect(evaluateRouteAccess('/courses/?tab=all', adminSession)).toEqual({ kind: 'ok' });
  });

  it('allows learner cabinet routes with enrollment read permission', () => {
    const learner = { ...adminSession, permissions: ['enrollments.read'] };
    expect(evaluateRouteAccess('/learner/courses/abc', learner)).toEqual({ kind: 'ok' });
  });

  it('makes the "Мои документы" learner link reachable (has routeMeta)', () => {
    const learner = { ...adminSession, permissions: ['enrollments.read'] };
    expect(evaluateRouteAccess('/learner/documents', learner)).toEqual({ kind: 'ok' });
  });

  it('every navigation link target resolves to a routeMeta entry (no link 404s)', () => {
    const unreachable = navigationModel
      .map((item) => item.href)
      .filter((href) => resolveRouteMeta(href) === null);
    expect(unreachable).toEqual([]);
  });

  it('shows workspace in navigation for tenant.read permission', () => {
    const tenantViewer = { ...adminSession, permissions: ['tenant.read'] };
    const visible = getVisibleNavigation(tenantViewer).map((item) => item.href);
    expect(visible).toContain('/workspace');
  });

  it('builds compact main menu with extra items in "more"', () => {
    const nav = getNavigationView(adminSession);
    expect(nav.main.length).toBeLessThanOrEqual(7);
    expect(nav.more.length).toBeGreaterThan(0);
  });

  // === Phase 2 Plan A — /admin/bulk-enrollments wiring ===

  it('allows /admin/bulk-enrollments with both learners.write and enrollments.write', () => {
    const session = {
      ...adminSession,
      permissions: ['learners.write', 'enrollments.write']
    };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'ok' });
  });

  it('forbids /admin/bulk-enrollments without learners.write', () => {
    const session = { ...adminSession, permissions: ['enrollments.write'] };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'forbidden' });
  });

  it('forbids /admin/bulk-enrollments without enrollments.write', () => {
    const session = { ...adminSession, permissions: ['learners.write'] };
    expect(evaluateRouteAccess('/admin/bulk-enrollments', session)).toEqual({ kind: 'forbidden' });
  });

  it('shows /admin/bulk-enrollments in nav only when both permissions present', () => {
    const session = {
      ...adminSession,
      permissions: ['learners.write', 'enrollments.write']
    };
    const visible = getVisibleNavigation(session).map((item) => item.href);
    expect(visible).toContain('/admin/bulk-enrollments');
  });

  // === Фаза 2 — сироты, заглушки, русификация ===

  it('routeMeta: сирота /admin/issuance-journal доступен как /documents (tenant.read)', () => {
    expect(resolveRouteMeta('/admin/issuance-journal')?.requiredPermissions).toEqual([
      'tenant.read'
    ]);
  });

  it('routeMeta: сирота /admin/licenses — админ-only (auth.manage_sessions)', () => {
    expect(resolveRouteMeta('/admin/licenses')?.requiredPermissions).toEqual([
      'auth.manage_sessions'
    ]);
  });

  /*
   * Было три «сироты», добавленных в меню, чтобы страница не терялась. Настройки вебинаров
   * с среза 4 живут секцией в `/settings`, а их прежний адрес стал перенаправлением —
   * пункт меню на редирект убран в срезе 13 (`IA-017`). Правило теста прежнее: страница
   * не должна быть недостижимой, поэтому проверяем достижимость, а не конкретный пункт.
   */
  it('nav: прежние «сироты» достижимы из меню', () => {
    const hrefs = navigationModel.map((item) => item.href);
    expect(hrefs).toContain('/admin/issuance-journal');
    expect(hrefs).toContain('/admin/licenses');
    expect(hrefs).toContain('/settings');
  });

  it('nav: заглушки /mailings и /crm/deals скрыты из меню, но страницы доступны', () => {
    const hrefs = navigationModel.map((item) => item.href);
    expect(hrefs).not.toContain('/mailings');
    expect(hrefs).not.toContain('/crm/deals');
    expect(resolveRouteMeta('/mailings')).not.toBeNull();
    expect(resolveRouteMeta('/crm/deals')).not.toBeNull();
  });

  it('nav: латинские метки русифицированы', () => {
    const label = (href: string) => navigationModel.find((i) => i.href === href)?.label ?? '';
    expect(label('/student/dashboard')).toBe('Панель студента');
    expect(label('/teacher/grading-center')).toBe('Центр проверки работ');
  });

  /*
   * Проверяем ПРАВИЛО, а не три знакомых пункта: ни одна подпись меню не написана
   * латиницей. Прежний тест сторожил `/admin/cockpit`, который в срезе 13 ушёл из меню
   * (стал перенаправлением на `/workspace`), — правило от этого не исчезло.
   */
  it('nav: подпись меню написана по-русски (название стандарта в скобках допустимо)', () => {
    // «SCORM» — имя отраслевого стандарта, как «PDF»: его не переводят. Но подпись целиком
    // из латиницы человеку ничего не говорит, поэтому требуем кириллицу в подписи.
    const foreign = navigationModel.filter((item) => !/[А-Яа-яЁё]/.test(item.label));
    expect(foreign.map((item) => `${item.label} → ${item.href}`)).toEqual([]);
  });
});

describe('состав меню после Фазы 1 редизайна (IA-011, IA-013)', () => {
  // Права берём из самой модели навигации: администратор с полным набором — худший
  // случай для бюджета меню, именно на нём проверяется потолок в семь пунктов.
  const fullAdmin: UserSession = {
    ...adminSession,
    permissions: navigationModel.flatMap((item) => item.requiredPermissions ?? [])
  };

  it('главное меню не длиннее семи пунктов', () => {
    expect(getNavigationView(fullAdmin).main.length).toBeLessThanOrEqual(7);
  });

  it('меню начинается с оперативной панели, а не с реестра пользователей', () => {
    expect(getNavigationView(fullAdmin).main[0]?.href).toBe('/workspace');
  });

  it('ежедневные разделы администратора видны сразу', () => {
    const main = getNavigationView(fullAdmin).main.map((item) => item.href);
    expect(main).toContain('/learners');
    expect(main).toContain('/groups');
    expect(main).toContain('/documents');
  });

  it('ни один доступный пункт не теряется между главным меню и «Ещё»', () => {
    const view = getNavigationView(fullAdmin);
    const shown = new Set([...view.main, ...view.more].map((item) => item.href));
    for (const item of getVisibleNavigation(fullAdmin)) {
      expect(shown, item.href).toContain(item.href);
    }
  });
});
