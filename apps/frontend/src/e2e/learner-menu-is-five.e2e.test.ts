import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { getNavigationView, getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';
import { linksForPermissions } from '../lib/rbac/visible-links';

import type { UserSession } from '../entities/session/model';

/**
 * У слушателя пять пунктов меню, все на виду (ТЗ «Стабилизация, UX и развитие», 6.1 / С1).
 *
 * **Как было.** Двенадцать разделов: семь сверху и пять под «Ещё» — «Календарь», «Мои
 * задания», «Мои вебинары», «Мои оплаты», «Подтверждение личности». Человек, который заходит
 * раз в год и часто с телефона, искал нужное перебором двух этажей (журнал 490).
 *
 * **Что закреплено.**
 *
 * 1. У сессии, где нет ни одной роли сотрудника, меню — РОВНО пять пунктов чертежа.
 * 2. Второго этажа «Ещё» у такой сессии нет вовсе.
 * 3. Ни один ушедший раздел не стал недостижим: «Задания», «Вебинары» и «Календарь»
 *    открываются с главной кабинета, «Подтверждение личности» и «Оплаты» — из профиля.
 * 4. У сотрудника «Ещё» остаётся: у него три десятка разделов, и правило пяти к нему не
 *    относится.
 */

const HOME = fromApp('src', 'features', 'learner-home', 'more-in-learning.tsx');
const PROFILE = fromApp('src', 'features', 'learner-profile', 'learner-profile-screen.tsx');
const PLAN = fromApp(
  '..',
  '..',
  'docs',
  'superpowers',
  'plans',
  '2026-09-18-stabux-phase-6-learner-cabinet.md'
);

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Права слушателя — те же, что у роли `learner` в живой базе (0038). */
const LEARNER_RIGHTS = [
  'tenant.read',
  'enrollments.read',
  'assessment.tests.read',
  'assessment.assignments.read',
  'identity.submit',
  'payments.self_purchase',
  'webinars.attend'
];

const sessionOf = (roles: string[], permissions: string[]): UserSession =>
  ({
    roles,
    permissions,
    user: { id: 'u1', tenantId: 't1' },
    tokens: { accessToken: 'x' }
  }) as unknown as UserSession;

describe('меню слушателя — пять пунктов (ТЗ 6.1)', () => {
  it('ровно пять пунктов и ни одного под «Ещё»', () => {
    const view = getNavigationView(sessionOf(['learner'], LEARNER_RIGHTS));
    expect(view.main.map((item) => item.href)).toEqual([
      '/learner',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/learner/profile'
    ]);
    expect(view.more, 'второй этаж «Ещё» у слушателя запрещён ТЗ').toEqual([]);
  });

  it('у сотрудника «Ещё» остаётся — правило пяти не про него', () => {
    // У администратора центра три десятка разделов; пять пунктов там ничего не решают.
    const view = getNavigationView(
      sessionOf(['tenant_admin'], ['tenant.read', 'learners.read', 'groups.read', 'reports.read'])
    );
    expect(view.more.length, 'сотруднику второй этаж нужен').toBeGreaterThan(0);
  });

  it('ушедшие из меню разделы открываются из содержимого', () => {
    /*
     * Главная проверка задачи. Убрать пункт из меню, не дав другого пути, — значит спрятать
     * раздел насовсем; это было бы хуже двух этажей (журнал 491).
     */
    const fromHome = read(HOME);
    for (const href of ['/learner/assignments', '/learner/webinars', '/learning/calendar']) {
      expect(fromHome, `${href} обязан открываться с главной кабинета`).toContain(href);
    }
    const fromProfile = read(PROFILE);
    for (const href of ['/learner/identity', '/learner/payments']) {
      expect(fromProfile, `${href} обязан открываться из профиля`).toContain(href);
    }
  });

  it('ни один раздел кабинета не потерян', () => {
    /*
     * Сверяется ПОЛНЫЙ состав: всё, что слушателю открыто правами, обязано быть достижимо —
     * либо пунктом меню, либо ссылкой с главной или из профиля.
     */
    const session = sessionOf(['learner'], LEARNER_RIGHTS);
    const reachable = new Set([
      ...getNavigationView(session).main.map((item) => item.href),
      ...[...read(HOME).matchAll(/href: '([^']+)'/g)].map((m) => m[1]),
      ...[...read(PROFILE).matchAll(/href: '([^']+)'/g)].map((m) => m[1])
    ]);
    const lost = getVisibleNavigation(session)
      .filter((item) => item.href.startsWith('/learner') || item.href === '/learning/calendar')
      .map((item) => item.href)
      .filter((href) => !reachable.has(href));
    expect(lost, 'раздел без единого пути — это спрятанный раздел').toEqual([]);
  });

  it('профиль слушателя существует и не требует прав администратора', () => {
    // Общий экран настроек живёт под `iam.manage_roles` — слушателю туда нельзя.
    const item = navigationModel.find((one) => one.href === '/learner/profile');
    expect(item?.label).toBe('Профиль');
    expect(item?.requiredPermissions).toEqual(['enrollments.read']);
  });

  it('разделы профиля и главной показываются ПО ПРАВАМ, а не всем подряд', () => {
    /*
     * Э2: ссылка на раздел, куда человека не пустят, — это тупик, а не навигация.
     *
     * Проверяются ЗНАЧЕНИЯ чистой функции, а не текст файла: первая редакция искала слово
     * `hasPermission` и была довольна одной строкой импорта, когда отбор из кода убрали
     * (журнал 494 — тот же класс, что 464).
     */
    const links = [
      { href: '/a', label: 'А', hint: '', permission: 'can.a' },
      { href: '/b', label: 'Б', hint: '', permission: 'can.b' }
    ];
    expect(linksForPermissions(links, ['can.a']).map((one) => one.href)).toEqual(['/a']);
    expect(linksForPermissions(links, []).map((one) => one.href)).toEqual([]);
    expect(linksForPermissions(links, ['can.a', 'can.b'])).toHaveLength(2);

    for (const file of [HOME, PROFILE]) {
      expect(read(file), 'экран обязан пользоваться общим отбором').toContain(
        'linksForPermissions('
      );
    }
  });

  it('план фазы 6 записан', () => {
    const plan = readFileSync(PLAN, 'utf8');
    expect(plan).toContain('6.1');
    expect(plan, 'фаза начинается с плана — правило репозитория').toContain('Задача 1');
  });
});
