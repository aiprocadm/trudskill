import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveRouteMeta } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';
import { NAV_GROUPS } from '../features/navigation/nav-groups';

/**
 * ФТ-H1 (Фаза 5 Task 8): сверка информационной архитектуры — правило тестом.
 *
 * Три инварианта, каждый из которых уже ловил живой баг:
 * 1. КАЖДЫЙ маршрут приложения знаком карте доступа (`routeMeta`) — маршрут вне
 *    карты считается not-found, и защищённая страница выбрасывает пользователя
 *    (так в Фазе 5 Task 1 не открывался кабинет слушателя `/learner`).
 * 2. Пункт меню и пункт блока указывают на СУЩЕСТВУЮЩУЮ страницу — мёртвая ссылка
 *    в сайдбаре хуже отсутствующей.
 * 3. Каждый маршрут первого уровня принадлежит ровно одному блоку ИА (или явно
 *    объявлен служебным) — «страница есть, из меню не добраться» и есть сирота.
 *
 * URL здесь НЕ проверяются на «правильность» и не меняются — только принадлежность.
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

/** Маршруты из файловой системы: app/x/y/page.tsx -> /x/y (динамические сегменты как есть). */
const collectRoutes = (dir: string, prefix = ''): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full, `${prefix}/${entry}`));
    } else if (entry === 'page.tsx') {
      out.push(prefix || '/');
    }
  }
  return out;
};

/** Динамический сегмент [param] -> подставное значение: карта доступа матчится по префиксу. */
const toConcretePath = (route: string): string => route.replace(/\[[^/]+\]/g, 'x-probe') || '/';

/**
 * Служебные маршруты вне блоков ИА — осознанно: это не разделы продукта, а
 * технические страницы (вход/выход, ошибки, публичные страницы без сессии,
 * витрина ui-kit, заглушка выключенного модуля).
 */
const SERVICE_ROUTES = new Set([
  '/login',
  '/login/magic-link/[token]',
  '/logout',
  '/not-found',
  '/forbidden',
  '/verify/[token]',
  '/admin/ui-kit',
  '/exam-auth/[token]',
  '/tenant-not-found',
  '/module-empty'
]);

/**
 * Заглушки, ОСОЗНАННО скрытые из меню (решение закреплено в helpers.test.ts:
 * «страница доступна по прямой ссылке, но сырое в сайдбар не выносим»).
 * Это НЕ сироты: скрытие — решение, сирота — недосмотр; список делает разницу явной.
 */
const HIDDEN_STUB_ROUTES = new Set(['/mailings', '/crm/deals', '/forms']);

/**
 * Принадлежность блоку. Правило то же, что у карты доступа: побеждает самое
 * ДЛИННОЕ совпадение — '/learner/documents' принадлежит блоку «Документы»
 * (точный пункт), а не «Моё обучение» (префикс '/learner').
 */
const belongsToGroup = (route: string): string[] => {
  const concrete = route.replace(/\[[^/]+\]/g, 'x-probe');
  let best: { id: string; length: number }[] = [];
  let bestLength = -1;
  for (const group of NAV_GROUPS) {
    for (const href of group.hrefs) {
      const matches =
        href === '/' ? concrete === '/' : concrete === href || concrete.startsWith(`${href}/`);
      if (!matches) continue;
      if (href.length > bestLength) {
        bestLength = href.length;
        best = [{ id: group.id, length: href.length }];
      } else if (href.length === bestLength && !best.some((b) => b.id === group.id)) {
        best.push({ id: group.id, length: href.length });
      }
    }
  }
  return best.map((b) => b.id);
};

const routes = collectRoutes(APP_DIR);

describe('информационная архитектура (ФТ-H1)', () => {
  it('сканер видит все маршруты приложения (сторож самого сканера)', () => {
    expect(routes.length).toBeGreaterThan(90);
  });

  it('каждый маршрут знаком карте доступа: страниц-невидимок нет', () => {
    const unknown = routes.filter((r) => resolveRouteMeta(toConcretePath(r)) === null);
    expect(unknown, 'маршруты вне routeMeta (страница выбросит пользователя в not-found)').toEqual(
      []
    );
  });

  it('каждый пункт меню ведёт на существующую страницу', () => {
    const routeSet = new Set(routes);
    const dead = navigationModel.map((item) => item.href).filter((href) => !routeSet.has(href));
    expect(dead, 'пункты меню без страницы').toEqual([]);
  });

  it('каждый пункт блока ИА существует в меню (блоки не выдумывают ссылок)', () => {
    const navSet = new Set(navigationModel.map((item) => item.href));
    const ghosts = NAV_GROUPS.flatMap((g) => g.hrefs).filter((href) => !navSet.has(href));
    expect(ghosts, 'пункты блоков без пункта меню').toEqual([]);
  });

  it('каждый маршрут принадлежит ровно одному блоку ИА, объявлен служебным или скрытой заглушкой', () => {
    const problems = routes
      .filter((r) => !SERVICE_ROUTES.has(r) && !HIDDEN_STUB_ROUTES.has(r))
      .map((r) => ({ route: r, groups: belongsToGroup(r) }))
      .filter((row) => row.groups.length !== 1);
    expect(problems, 'маршруты-сироты (нет блока) или дубли (блоков больше одного)').toEqual([]);
  });

  it('служебный список не протухает: каждая запись — существующий маршрут вне блоков', () => {
    const routeSet = new Set(routes);
    const stale = [...SERVICE_ROUTES].filter(
      (r) => !routeSet.has(r) || belongsToGroup(r).length > 0
    );
    expect(stale, 'записи служебного списка без маршрута или уже накрытые блоком').toEqual([]);
  });

  it('скрытые заглушки: страница существует и знакома карте, но в меню её нет', () => {
    const routeSet = new Set(routes);
    const navSet = new Set(navigationModel.map((item) => item.href));
    const broken = [...HIDDEN_STUB_ROUTES].filter(
      (r) => !routeSet.has(r) || navSet.has(r) || resolveRouteMeta(toConcretePath(r)) === null
    );
    expect(broken, 'заглушка исчезла, попала в меню или выпала из карты доступа').toEqual([]);
  });
});
