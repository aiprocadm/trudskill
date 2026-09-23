import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { getSessionRoleBlueprints, roleBlueprints } from './role-blueprints';

import type { UserSession } from '../../entities/session/model';

const sessionWithRoles = (roles: string[]): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'user',
    email: null,
    status: 'active',
    displayName: 'User'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles,
  permissions: []
});

describe('короткие меню ролей (IA-013)', () => {
  it('меню администратора — ровно 7 пунктов из ТЗ §4.4', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.primaryNav).toEqual([
      '/workspace',
      '/learners',
      '/groups',
      '/assessment',
      '/documents',
      '/reports',
      '/settings'
    ]);
  });

  it('ни у одной роли меню не длиннее 7 пунктов (бюджет плотности §13.2)', () => {
    const tooLong = roleBlueprints
      .filter((item) => item.primaryNav.length > 7)
      .map((item) => `${item.role}: ${item.primaryNav.length}`);
    expect(tooLong).toEqual([]);
  });

  /*
   * Ключевой тест фазы. getNavigationView берёт пункт через byHref.get(href) и
   * МОЛЧА пропускает адрес, которого нет в navigationModel: меню окажется короче
   * семи, ошибки не будет, заметить можно только глазами. Опечатка в адресе здесь
   * стоит пропавшего раздела.
   */
  it('каждый адрес из primaryNav существует в navigationModel', () => {
    const known = new Set(navigationModel.map((item) => item.href));
    const missing = roleBlueprints.flatMap((blueprint) =>
      blueprint.primaryNav
        .filter((href) => !known.has(href))
        .map((href) => `${blueprint.role} → ${href}`)
    );
    expect(missing).toEqual([]);
  });

  it('меню администратора ведёт в ежедневную работу, а не только в настройки', () => {
    // Старый список ['/', '/users', '/reports', '/audit', '/settings'] не вёл ни в
    // один админский маршрут — из меню было не попасть в зачисление и группы.
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.primaryNav).toContain('/groups');
    expect(admin?.primaryNav).toContain('/learners');
  });

  it('роль manager имеет своё меню (ТЗ §4.4, состав по 8.3)', () => {
    /*
     * ТЗ 8.3 назвал состав кабинета поимённо: Панель · Компании · Группы · Слушатели ·
     * Отчёты, «всё остальное убрать». Из прежнего списка ушли «Шаблоны документов» — у
     * руководителя по живой `iam.role_permissions` только `documents.read`, то есть на той
     * странице у него нет ни одного действия (журнал 529).
     *
     * Срез 15 (остаётся в силе): `/counterparties` и `/admin/clients` были двумя экранами
     * одной сущности; по решению владельца остались «Компании» (`/admin/clients`).
     */
    const manager = roleBlueprints.find((item) => item.role === 'manager');
    expect(manager?.primaryNav).toEqual([
      '/manager',
      '/admin/clients',
      '/groups',
      '/learners',
      '/reports'
    ]);
    expect(manager?.exactNav, 'меню ровно по чертежу: второго этажа «Ещё» нет').toBe(true);
  });

  it('меню методиста ведёт только туда, куда пускают его права (журнал 344)', () => {
    /*
     * ТЗ §4.4 ставило методисту «Группы» и «Отчёты», но `groups.read` и `learners.read`
     * у роли нет (сверено по `iam.role_permissions` живой базы): пункты молча не
     * показывались, и меню добивалось «Мои тесты» / «Мои задания» из кабинета слушателя.
     * Вместо них — банки вопросов (сборка тестов) и библиотека курсов (сборка программы):
     * разделы работы методиста, открытые его правами. Сторож `role-menu-reachable`
     * в бэкенде сверяет каждый чертёж со снимком прав роли.
     */
    const methodist = roleBlueprints.find((item) => item.role === 'methodist');
    expect(methodist?.primaryNav).toEqual([
      '/methodist',
      '/courses',
      '/materials',
      '/assessment',
      '/admin/question-banks',
      '/library'
    ]);
  });

  it('getSessionRoleBlueprints находит manager по роли сессии', () => {
    const found = getSessionRoleBlueprints(sessionWithRoles(['manager'])).map((item) => item.role);
    expect(found).toEqual(['manager']);
  });

  it('задачи администратора сформулированы результатом, а не обязанностью (IA-002)', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.topJobs[0]).toBe('Увидеть, что горит сегодня');
    expect(admin?.topJobs).toContain('Зачислить слушателя в группу');
  });

  /*
   * IA-014. getSessionRoleBlueprints возвращает роли в порядке ОБЪЯВЛЕНИЯ массива,
   * а не в порядке ролей сессии, и getNavigationView берёт меню у первой. Значит
   * порядок записей в файле молча решает, какое меню увидит человек с двумя
   * ролями: при произвольном порядке администратор, числящийся ещё и менеджером,
   * получил бы меню менеджера и не нашёл бы своих разделов.
   *
   * Порядок задан от самой полной роли к самой узкой — тем же принципом, что и
   * таблица домашних маршрутов в role-home.ts («порядок = приоритет», §5.241).
   */
  it('IA-014: у мультироли меню берётся от самой полной роли', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    const blueprints = getSessionRoleBlueprints(sessionWithRoles(['manager', 'tenant_admin']));
    expect(blueprints[0]?.role).toBe('tenant_admin');
    expect(blueprints[0]?.primaryNav).toEqual(admin?.primaryNav);
  });

  it('IA-014: порядок ролей задан от полной к узкой и закреплён', () => {
    expect(roleBlueprints.map((item) => item.role)).toEqual([
      'platform_admin',
      'tenant_admin',
      'manager',
      'curator',
      'methodist',
      'teacher',
      'learner'
    ]);
  });
});
