import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { getNavigationView } from '../features/navigation/helpers';
import { roleBlueprints } from '../features/navigation/role-blueprints';

import type { UserSession } from '../entities/session/model';

/**
 * Кабинет администратора платформы (ТЗ «Стабилизация, UX и развитие», 8.1).
 *
 * **Как было.** Чертёж его меню был верным, но общее правило дополняло короткое меню до семи
 * пунктов любыми разделами, куда пускают права, — и в меню попадали «Курсы», а под «Ещё» — весь
 * набор работы внутри центра: слушатели, группы, заказы, документы, комиссии (журнал 527). ТЗ
 * прямо требует это убрать: администратор платформы не работает внутри центра, он попадает туда
 * через «Войти от имени».
 *
 * **Что закреплено.**
 *
 * 1. Меню — ровно чертёж, без дополнения и без второго этажа.
 * 2. Работы внутри центра в нём нет ни одним пунктом.
 * 3. То, что ТЗ велит оставить, — на месте.
 * 4. Признак «меню ровно по чертежу» действует только когда ВСЕ роли человека такие: иначе
 *    человек с двумя ролями потерял бы разделы второй.
 */

/*
 * Права взяты из карты меню — оттуда же, откуда их берёт код, а не придуманы по названию роли
 * (правило репозитория: наборы прав из живого источника). Права работы внутри центра включены
 * НАМЕРЕННО: администратор платформы ими обладает, и именно поэтому раньше видел чужую работу.
 */
const PLATFORM_RIGHTS = [
  'workspace.read',
  'platform.tenants.read',
  'auth.manage_sessions',
  'operations.quarantine.read',
  'tenant.usage.read',
  'tenant.read',
  'courses.read',
  'learners.read',
  'groups.read',
  'documents.read',
  'reports.read'
];

const sessionOf = (roles: string[], permissions: string[]): UserSession =>
  ({
    roles,
    permissions,
    user: { id: 'u1', tenantId: 't1' },
    tokens: { accessToken: 'x' }
  }) as unknown as UserSession;

describe('кабинет администратора платформы (ТЗ 8.1)', () => {
  it('меню — ровно чертёж, без второго этажа', () => {
    const view = getNavigationView(sessionOf(['platform_admin'], PLATFORM_RIGHTS));
    expect(view.main.map((item) => item.label)).toEqual([
      'Оперативная панель',
      'Арендаторы платформы',
      'Лицензии и аккредитации',
      'Журнал действий',
      'Эксплуатация',
      'Потребление',
      'Уведомления'
    ]);
    expect(view.more, 'под «Ещё» пряталась вся работа внутри центра').toEqual([]);
  });

  it('работы внутри центра в кабинете нет', () => {
    const view = getNavigationView(sessionOf(['platform_admin'], PLATFORM_RIGHTS));
    const all = [...view.main, ...view.more].map((item) => item.href);
    for (const href of [
      '/courses',
      '/learners',
      '/groups',
      '/documents',
      '/commissions',
      '/orders'
    ]) {
      expect(all, `${href} — работа внутри центра, ей тут не место`).not.toContain(href);
    }
  });

  it('то, что ТЗ велит оставить, на месте', () => {
    const view = getNavigationView(sessionOf(['platform_admin'], PLATFORM_RIGHTS));
    const all = view.main.map((item) => item.href);
    for (const href of [
      '/platform/tenants',
      '/admin/licenses',
      '/audit',
      '/admin/operations',
      '/admin/usage'
    ]) {
      expect(all, `${href} — работа администратора платформы`).toContain(href);
    }
  });

  it('признак «меню ровно по чертежу» стоит там, где ТЗ описал кабинет поимённо', () => {
    const exact = roleBlueprints.filter((one) => one.exactNav).map((one) => one.role);
    expect(
      exact.sort(),
      'слушатель (6.1), администратор платформы (8.1) и руководитель (8.3)'
    ).toEqual(['learner', 'manager', 'platform_admin']);
  });

  it('у человека с двумя ролями меню не обрезается', () => {
    /*
     * Иначе администратор центра, которому дали и роль платформы, потерял бы свою работу:
     * правило действует, только когда ВСЕ роли человека описаны поимённо.
     */
    const view = getNavigationView(sessionOf(['platform_admin', 'tenant_admin'], PLATFORM_RIGHTS));
    expect(view.more.length, 'вторая роль приносит свои разделы').toBeGreaterThan(0);
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
    expect(plan).toContain('8.1');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Срез 1');
  });
});
