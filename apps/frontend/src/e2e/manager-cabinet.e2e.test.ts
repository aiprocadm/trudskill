import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { evaluateRouteAccess, getNavigationView } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';
import { roleBlueprints } from '../features/navigation/role-blueprints';
import { ROLE_HOME_ROUTES, resolveRoleHome } from '../features/navigation/role-home';
import { TOP_JOB_ROUTES } from '../features/navigation/top-job-routes';

import type { UserSession } from '../entities/session/model';

/**
 * Кабинет руководителя (ТЗ «Стабилизация, UX и развитие», 8.3).
 *
 * **Как было.** Самый недоделанный кабинет в продукте. Своей стартовой страницы не было: вход
 * приводил прямо в список групп — в середину работы, без ответа на вопрос «что у меня вообще
 * происходит». В главном меню стояло СЕМЬ пунктов, среди них «Шаблоны документов» — страница,
 * где у руководителя нет ни одного действия, — а под «Ещё» лежали ДВАДЦАТЬ ТРИ раздела:
 * госвыгрузки, подписание документов, учебные пакеты, даже сводка методиста.
 *
 * **Что закреплено.**
 *
 * 1. Состав кабинета — ровно пять пунктов, названных ТЗ: Панель · Компании · Группы ·
 *    Слушатели · Отчёты. Второго этажа «Ещё» нет.
 * 2. Вход ведёт на панель, а не в список групп.
 * 3. Разделы, где у роли нет права ДЕЙСТВОВАТЬ, из меню убраны — прежде всего документы:
 *    по живой `iam.role_permissions` у руководителя только `documents.read`.
 * 4. Задачи роли — только те, которые она вправе выполнить.
 *
 * **Права взяты из живой базы стенда** (`iam.role_permissions`), а не из названия роли и не
 * из текста ТЗ: на этом в проекте уже обжигались дважды.
 */

const MANAGER_PERMISSIONS = [
  'assessment.assignments.read',
  'assessment.attempts.read',
  'assessment.attempts.take',
  'assessment.question_banks.read',
  'assessment.questions.read',
  'assessment.read.cross_learner',
  'assessment.results.read',
  'assessment.reviews.review',
  'assessment.submissions.submit',
  'assessment.tests.read',
  'counterparties.read',
  'counterparties.write',
  'courses.read',
  'directions.read',
  'documents.read',
  'enrollments.change_status',
  'enrollments.read',
  'enrollments.write',
  'esign.applications.read',
  'esign.processes.read',
  'groups.read',
  'groups.write',
  'learners.act_as',
  'learners.read',
  'learners.write',
  'learning.commissions.read',
  'learning.course_document_sets.read',
  'materials.read',
  'portal.read',
  'progress.read',
  'regulatory.export.read',
  'tenant.read',
  'workspace.read'
];

const managerSession = (): UserSession => ({
  user: {
    id: 'u_manager',
    tenantId: 't1',
    login: 'manager',
    email: null,
    status: 'active',
    displayName: 'Руководитель'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: ['manager'],
  permissions: MANAGER_PERMISSIONS
});

const blueprint = () => roleBlueprints.find((item) => item.role === 'manager');

describe('кабинет руководителя (ТЗ 8.3)', () => {
  it('меню — ровно пять пунктов, названных ТЗ, и ничего под «Ещё»', () => {
    const view = getNavigationView(managerSession());

    expect(view.main.map((item) => item.label)).toEqual([
      'Панель руководителя',
      'Компании',
      'Группы',
      'Слушатели',
      'Отчёты'
    ]);
    expect(view.more, 'второго этажа у кабинета, описанного ТЗ поимённо, нет').toEqual([]);
  });

  it('документов в меню нет: права действовать у роли не выдано', () => {
    const view = getNavigationView(managerSession());
    const hrefs = view.main.concat(view.more).map((item) => item.href);

    expect(MANAGER_PERMISSIONS, 'выдача документов роли не выдана').not.toContain(
      'documents.generate'
    );
    expect(MANAGER_PERMISSIONS, 'править бланки роль тоже не может').not.toContain(
      'documents.write'
    );
    expect(hrefs, 'страница бланков без единого действия в меню не нужна').not.toContain(
      '/documents'
    );
  });

  it('вход ведёт на панель, а не в середину работы', () => {
    expect(resolveRoleHome(managerSession())).toBe('/manager');
    expect(
      ROLE_HOME_ROUTES.find((item) => item.role === 'manager')?.href,
      'таблица домашних маршрутов — единственный источник этой правды'
    ).toBe('/manager');
  });

  it('панель открыта именно тем, кто ведёт компании и группы', () => {
    /*
     * Проверяется ДОСТУП, а не только пункт меню. Права на адрес и права на пункт лежат в
     * РАЗНЫХ местах модели навигации (`routeMeta` и `navigationModel`), и разъехаться они
     * могут молча: меню спрячет раздел, а по прямой ссылке человек в него всё равно войдёт —
     * или наоборот, пункт покажется, а страница ответит отказом. Подсаженная поломка,
     * сузившая право адреса до `groups.read`, этим сторожем сначала НЕ ловилась (журнал 531).
     */
    const item = navigationModel.find((one) => one.href === '/manager');
    expect(item?.requiredPermissions?.slice().sort()).toEqual([
      'counterparties.read',
      'groups.read'
    ]);

    expect(evaluateRouteAccess('/manager', managerSession()).kind).toBe('ok');

    // Преподаватель ведёт группы, но заказчиков не видит — панель про компании не его.
    const teacher = {
      ...managerSession(),
      roles: ['teacher'],
      permissions: MANAGER_PERMISSIONS.filter((code) => code !== 'counterparties.read')
    };
    expect(
      evaluateRouteAccess('/manager', teacher).kind,
      'без права на компании адрес должен быть закрыт, а не только спрятан из меню'
    ).toBe('forbidden');
  });

  it('каждая задача роли ведёт в её собственное меню', () => {
    /*
     * Смысл проверки: «Выдать документы группе» стояла задачей роли, а путь вёл на страницу
     * бланков, где у неё нет прав. Задача, до которой из СВОЕГО меню не дойти, — обещание,
     * которое продукт не выполняет.
     */
    const view = getNavigationView(managerSession());
    const reachable = new Set(view.main.map((item) => item.href));
    const jobs = blueprint()?.topJobs ?? [];

    expect(jobs.length, 'работа роли должна быть описана').toBeGreaterThanOrEqual(5);
    for (const job of jobs) {
      expect(TOP_JOB_ROUTES[job]?.href, `«${job}»: путь не описан`).toBeTruthy();
      expect(reachable, `«${job}» ведёт в раздел вне меню роли`).toContain(
        TOP_JOB_ROUTES[job]!.href
      );
    }
  });

  it('панель отвечает на все четыре вопроса ТЗ', () => {
    const screen = readFileSync(
      fromApp('src', 'features', 'manager-home', 'manager-home-screen.tsx'),
      'utf8'
    );

    expect(screen, 'кто не успевает').toMatch(/Не успевают/);
    expect(screen, 'что горит по срокам').toMatch(/Ближайшие сроки/);
    expect(screen, 'как идёт обучение по компаниям').toMatch(/Компании/);
    expect(screen, 'сколько выдано документов').toMatch(/выдано документов/);
  });

  it('план фазы 8 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-19-stabux-phase-8-role-cabinets.md'
      ),
      'utf8'
    );
    expect(plan).toContain('8.3');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Срез 3');
  });
});
