import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  evaluateRouteAccess,
  getNavigationView,
  getVisibleNavigation,
  resolveRouteMeta
} from './helpers';
import { navigationModel, routeMeta } from './model';

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
    // Журнал 343: своё право (0091), а не `tenant.read`, которое есть и у слушателя.
    expect(resolveRouteMeta('/workspace')?.requiredPermissions).toEqual(['workspace.read']);
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

  it('shows workspace in navigation for workspace.read permission', () => {
    const staff = { ...adminSession, permissions: ['workspace.read'] };
    expect(getVisibleNavigation(staff).map((item) => item.href)).toContain('/workspace');
    // Журнал 343: `tenant.read` есть у слушателя — под ним панель ему больше не показывается.
    const tenantViewer = { ...adminSession, permissions: ['tenant.read'] };
    expect(getVisibleNavigation(tenantViewer).map((item) => item.href)).not.toContain('/workspace');
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

  it('routeMeta: сирота /admin/issuance-journal доступен как /documents (documents.read)', () => {
    // Журнал 343: право ручки GET /admin/documents/issuance-journal, то же, что у /documents.
    expect(resolveRouteMeta('/admin/issuance-journal')?.requiredPermissions).toEqual([
      'documents.read'
    ]);
    expect(resolveRouteMeta('/documents')?.requiredPermissions).toEqual(['documents.read']);
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

  it('nav: адреса-редиректы записи 109 из меню убраны', () => {
    // Фаза 6 срез 8: «Панель студента» и «Центр проверки работ» стали редиректами
    // (/learner и /teacher/review) — пункт меню на редирект был бы вторым входом.
    const hrefs = navigationModel.map((i) => i.href);
    expect(hrefs).not.toContain('/student/dashboard');
    expect(hrefs).not.toContain('/teacher/grading-center');
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
    // Журнал 345: кабинет слушателя (`/learner/**`) — не раздел администратора; в его меню
    // он не показывается сознательно (правило адресата ниже). Остальное — без потерь.
    for (const item of getVisibleNavigation(fullAdmin)) {
      if (item.href === '/learner' || item.href.startsWith('/learner/')) continue;
      expect(shown, item.href).toContain(item.href);
    }
  });
});

describe('меню собирается для адресата — сотруднику своё, слушателю своё (журнал 344, 345)', () => {
  /*
   * Права — по `iam.role_permissions` живой базы (2026-09-04), подмножеством, которого
   * хватает, чтобы воспроизвести: у методиста есть чтение курсов, материалов, тестов и
   * заданий — то есть по правам ему видны и «Мои тесты» / «Мои задания» из кабинета
   * слушателя, и ими getNavigationView добивал его главное меню до семи. У слушателя есть
   * те же `courses.read` / `assessment.tests.read` — и в его «Ещё» попадали «Курсы»,
   * «Тесты», «Задания» сотрудников: дубли его кабинета в чужой терминологии.
   */
  const withRoles = (roles: string[], permissions: string[]): UserSession => ({
    ...adminSession,
    roles,
    permissions
  });
  const staffRights = [
    'tenant.read',
    'courses.read',
    'materials.read',
    'assessment.tests.read',
    'assessment.assignments.read',
    'assessment.question_banks.read'
  ];
  const learnerRights = [
    'tenant.read',
    'courses.read',
    'materials.read',
    'enrollments.read',
    'assessment.tests.read',
    'assessment.assignments.read'
  ];
  const isLearnerCabinet = (href: string) => href === '/learner' || href.startsWith('/learner/');
  const shared = new Set(['/', '/notifications', '/chat', '/learning/calendar']);
  const hrefs = (items: Array<{ href: string }>) => items.map((item) => item.href);

  it('главное меню сотрудника не добивается кабинетом слушателя', () => {
    const view = getNavigationView(withRoles(['methodist'], staffRights));
    expect(hrefs(view.main).filter(isLearnerCabinet)).toEqual([]);
  });

  it('в «Ещё» сотрудника нет кабинета слушателя', () => {
    // Менеджер: по живой базе у него есть enrollments.read — им открыт весь кабинет слушателя.
    const manager = withRoles(
      ['manager'],
      ['tenant.read', 'groups.read', 'learners.read', 'enrollments.read', 'courses.read']
    );
    const view = getNavigationView(manager);
    expect(hrefs([...view.main, ...view.more]).filter(isLearnerCabinet)).toEqual([]);
  });

  it('слушатель не видит разделов сотрудников ни в главном меню, ни в «Ещё»', () => {
    const view = getNavigationView(withRoles(['learner'], learnerRights));
    const foreign = hrefs([...view.main, ...view.more]).filter(
      (href) => !isLearnerCabinet(href) && !shared.has(href)
    );
    expect(foreign).toEqual([]);
  });

  it('у слушателя меню — ровно пять пунктов, все на виду (ТЗ 6.1)', () => {
    /*
     * Было двенадцать: семь сверху и пять под «Ещё». ТЗ 6.1 (С1) сводит их к пяти и убирает
     * второй этаж совсем. Разделы, ушедшие из меню, открываются из содержимого: «Задания»,
     * «Вебинары» и «Календарь» — с главной кабинета, «Подтверждение личности» и «Оплаты» —
     * из профиля (журнал 490, 491).
     */
    const view = getNavigationView(withRoles(['learner'], learnerRights));
    expect(hrefs(view.main)).toEqual([
      '/learner',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/learner/profile'
    ]);
    expect(view.more, 'второго этажа «Ещё» у слушателя нет').toEqual([]);
  });

  it('у человека с ролями преподавателя и слушателя — и то и другое', () => {
    const view = getNavigationView(withRoles(['teacher', 'learner'], learnerRights));
    const shown = hrefs([...view.main, ...view.more]);
    expect(shown).toContain('/learner/tests');
    expect(shown).toContain('/courses');
  });

  it('роль без чертежа меню (представитель заказчика) видит всё, что открыто правами', () => {
    const session = withRoles(['counterparty_rep'], ['portal.read', 'courses.read']);
    const shown = new Set(
      hrefs([...getNavigationView(session).main, ...getNavigationView(session).more])
    );
    for (const item of getVisibleNavigation(session)) {
      expect(shown, item.href).toContain(item.href);
    }
  });

  it('пункт, который сессия видит по правам, никуда не пропадает из палитры — фильтр только для меню', () => {
    const session = withRoles(['learner'], learnerRights);
    expect(hrefs(getVisibleNavigation(session))).toContain('/courses');
  });
});

describe('правила с подстановкой действительно применяются (ревизия 2026-08-26)', () => {
  /*
   * Реестр содержит шаблоны вида `/learner/tests/[testId]/attempt/[attemptId]`, а
   * сопоставление шло по строке — с литеральными скобками такой шаблон не совпадал
   * НИКОГДА. Правило существовало и молчало: доступ решало более общее правило раздела,
   * то есть объявленное строгое право не применялось вовсе.
   */
  const methodist: UserSession = {
    ...adminSession,
    roles: ['methodist'],
    /* Набор взят из `iam.role_permissions` живой базы: у методиста ЕСТЬ чтение тестов и
       заданий, но НЕТ прохождения попыток и сдачи работ. */
    permissions: ['tenant.read', 'assessment.tests.read', 'assessment.assignments.read']
  };

  it('прохождение теста закрыто тому, у кого нет права проходить', () => {
    expect(evaluateRouteAccess('/learner/tests/tst_71c/attempt/att_3', methodist).kind).toBe(
      'forbidden'
    );
  });

  it('сдача практической работы закрыта тому, у кого нет права сдавать', () => {
    expect(evaluateRouteAccess('/learner/assignments/asn_9/submit', methodist).kind).toBe(
      'forbidden'
    );
  });

  it('список тестов при этом остаётся открытым — правило раздела не сломано', () => {
    expect(evaluateRouteAccess('/learner/tests', methodist).kind).toBe('ok');
  });

  it('карточка берёт правило карточки, а не раздела', () => {
    expect(resolveRouteMeta('/admin/tests/tst_1')?.requiredPermissions).toEqual([
      'assessment.tests.read'
    ]);
  });

  it('обычные разделы по-прежнему покрывают всё, что ниже', () => {
    expect(resolveRouteMeta('/learners/lrn_42/history')?.requiredPermissions).toEqual([
      'learners.read'
    ]);
  });

  it('шаблон длиннее пути не совпадает', () => {
    expect(resolveRouteMeta('/learner/tests/tst_1/attempt')?.requiredPermissions).toEqual([
      'assessment.tests.read'
    ]);
  });
});

describe('в реестре нет мёртвых правил', () => {
  /*
   * Правило, под которое не подходит ни одна страница продукта, — это не защита, а запись,
   * которую читают и считают защитой. Проверяем прямо по файловой системе `app/`.
   */
  const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app');

  const pages = (dir: string, acc: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        pages(full, acc);
        continue;
      }
      if (entry === 'page.tsx') acc.push(full);
    }
    return acc;
  };

  /** Путь страницы с подставленным значением вместо динамического сегмента. */
  const routeOf = (file: string) => {
    const rel = file
      .slice(APP.length + 1)
      .replace(/\\/g, '/')
      .replace(/\/page\.tsx$/, '');
    if (!rel || rel === 'page.tsx') return '/';
    return '/' + rel.replace(/\[\.\.\.[^\]]+\]/g, 'sample').replace(/\[[^\]]+\]/g, 'sample');
  };

  it('каждое правило описывает хотя бы одну существующую страницу', () => {
    const routes = pages(APP).map(routeOf);
    const dead = routeMeta
      .filter((entry) => !routes.some((route) => resolveRouteMeta(route) === entry.meta))
      .map((entry) => entry.pattern)
      .filter(
        (pattern) => !routes.some((route) => route === pattern || route.startsWith(`${pattern}/`))
      )
      .sort();
    expect(
      dead,
      'правило доступа не подходит ни к одной странице — оно не работает, а выглядит защитой'
    ).toEqual([]);
  });
});
