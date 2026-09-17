import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { navigationModel } from '../features/navigation/model';
import { NAV_GROUPS } from '../features/navigation/nav-groups';
import { SETTINGS_LINK_SECTIONS } from '../features/settings/sections';

/**
 * Один раздел — одно имя — одно место (ТЗ «Стабилизация, UX и развитие», 3.4 / Н3).
 *
 * **Как было.** Один и тот же раздел назывался по-разному в зависимости от того, откуда на него
 * смотреть: `/notifications` — «Сообщения» в меню, «Уведомления» в шапке, «Центр уведомлений» в
 * заголовке; `/sync-logs` — «Журнал синхронизации» в меню и «Журнал обмена» в настройках;
 * `/admin/usage` — «Использование» и «Потребление». Настройки центра жили в ЧЕТЫРЁХ пунктах.
 * Человек ищет «журнал» — в меню «аудит»; ищет «отчёты» — находит «Отчеты» без «ё» рядом с блоком
 * «Отчёты и выгрузки». Всего 25 пунктов меню из 61 называли раздел не так, как его страница.
 *
 * **Критерий приёмки ТЗ дословно:** «Ни один адрес не ведёт на два разных названия и ни одно
 * название не ведёт на два разных адреса. Проверяется тестом по реестру». Реестр — это
 * `navigationModel`: адрес → имя, а блок даёт `NAV_GROUPS`. `docs/ia/routes.md` — пересказ
 * реестра словами, и он сверяется с кодом, чтобы не устареть молча.
 *
 * Имена сверяются во всех местах, где человек их читает: меню (сам реестр), заголовок страницы
 * (`title="…"` на странице или в экране, который она рисует), хлебные крошки (их словарь не
 * должен содержать ключей, у которых есть пункт меню) и разделы настроек. Палитра поиска берёт
 * имена из того же реестра и отдельной проверки не требует.
 */

const APP = fromApp('app');
const FEATURES = fromApp('src', 'features');
const DOC = fromApp('..', '..', 'docs', 'ia', 'routes.md');

/**
 * Страницы, чей заголовок вычисляется, а не написан строкой, — с причиной у каждой.
 *
 * Сверять их по тексту исходника нельзя: имя собирается из данных. Список закрытый и сверяется
 * на равенство с фактом (см. последний тест): устаревшая запись покраснеет.
 */
const COMPUTED_TITLES: Record<string, string> = {
  '/learner':
    'заголовок кабинета — приветствие по имени слушателя, а имя раздела держит меню и крошки'
};

const pageFileOf = (href: string): string =>
  href === '/' ? join(APP, 'page.tsx') : join(APP, ...href.slice(1).split('/'), 'page.tsx');

/** Файлы, из которых страница берёт экран: сама страница плюс её импорты из `src/features`. */
const titleSourcesOf = (pageFile: string): string[] => {
  const source = readFileSync(pageFile, 'utf8');
  const out = [pageFile];
  for (const match of source.matchAll(/from '([^']+)'/g)) {
    const spec = match[1]!;
    if (!spec.startsWith('.')) continue;
    const base = resolve(dirname(pageFile), spec);
    if (!base.startsWith(FEATURES)) continue;
    for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
      if (existsSync(candidate)) {
        out.push(candidate);
        break;
      }
    }
  }
  return out;
};

const hasTitle = (files: string[], label: string): boolean =>
  files.some((file) => stripComments(readFileSync(file, 'utf8')).includes(`title="${label}"`));

/**
 * Ключи словаря подписей крошек — читаются из исходника.
 *
 * ТЗ 3.5 переключил словарь со слова-сегмента на адрес целиком (`pageLabels`): ключ теперь
 * `'/courses/new'`, а не `new`. Разборщик обновлён вместе с ним — прежний искал `segmentLabels`
 * и на новом файле молча вернул бы пустой список, то есть проверка «не спорит с меню» прошла бы
 * ни о чём. Поэтому здесь же проверяется, что словарь вообще найден.
 */
const breadcrumbPageKeys = (): string[] => {
  const code = stripComments(
    readFileSync(fromApp('src', 'features', 'navigation', 'breadcrumbs.ts'), 'utf8')
  );
  const start = code.indexOf('const pageLabels');
  expect(start, 'словарь подписей крошек `pageLabels` обязан существовать').toBeGreaterThan(-1);
  const end = code.indexOf('};', start);
  const keys = [...code.slice(start, end).matchAll(/^\s*'(\/[^']*)':\s*'/gm)].map((m) => m[1]!);
  expect(
    keys.length,
    'словарь найден, но ни одного ключа не разобрано — разборщик отстал'
  ).toBeGreaterThan(0);
  return keys;
};

describe('один раздел — одно имя — одно место (ТЗ 3.4)', () => {
  it('ни одно название не ведёт на два разных адреса', () => {
    const byLabel = new Map<string, string[]>();
    for (const item of navigationModel) {
      byLabel.set(item.label, [...(byLabel.get(item.label) ?? []), item.href]);
    }
    const clashes = [...byLabel.entries()].filter(([, hrefs]) => hrefs.length > 1);
    expect(
      clashes.map(([label, hrefs]) => `«${label}»: ${hrefs.join(', ')}`),
      'два раздела с одним именем неразличимы в меню и в поиске — переименуйте так, чтобы ' +
        'разница читалась («Комиссия центра» и «Аттестационные комиссии»)'
    ).toEqual([]);
  });

  it('заголовок страницы называет раздел так же, как меню', () => {
    const mismatched: string[] = [];
    for (const item of navigationModel) {
      if (item.href in COMPUTED_TITLES) continue;
      const page = pageFileOf(item.href);
      if (!existsSync(page)) continue; // страницу без файла ловит ia-architecture
      if (!hasTitle(titleSourcesOf(page), item.label))
        mismatched.push(`${item.href} → «${item.label}»`);
    }
    expect(
      mismatched,
      'страница обязана называться так же, как пункт меню, который на неё ведёт: иначе человек ' +
        'нажимает «Аудит» и попадает в «Журнал действий», не понимая, туда ли попал'
    ).toEqual([]);
  });

  it('словарь крошек не спорит с меню', () => {
    const menuHrefs = new Set(navigationModel.map((item) => item.href));
    const clashing = breadcrumbPageKeys().filter((key) => menuHrefs.has(key));
    expect(
      clashing,
      'у сегмента есть пункт меню — имя берётся оттуда; второй словарь называл раздел третьим словом'
    ).toEqual([]);
  });

  it('разделы настроек называют экраны так же, как меню', () => {
    const labelByHref = new Map(navigationModel.map((item) => [item.href, item.label]));
    const mismatched = SETTINGS_LINK_SECTIONS.filter(
      (section) =>
        section.href &&
        labelByHref.has(section.href) &&
        labelByHref.get(section.href) !== section.title
    ).map(
      (section) =>
        `${section.href}: в настройках «${section.title}», в меню «${labelByHref.get(section.href!)}»`
    );
    expect(mismatched).toEqual([]);
  });

  it('каждый пункт меню лежит ровно в одном блоке', () => {
    const orphans = navigationModel
      .map((item) => ({
        href: item.href,
        groups: NAV_GROUPS.filter((g) => g.hrefs.includes(item.href))
      }))
      .filter((row) => row.groups.length !== 1)
      .map((row) => `${row.href}: блоков ${row.groups.length}`);
    expect(orphans).toEqual([]);
  });

  it('реестр в docs/ia/routes.md не разошёлся с кодом', () => {
    const doc = readFileSync(DOC, 'utf8');
    const missing = navigationModel
      .filter((item) => !doc.includes(`\`${item.href}\``) || !doc.includes(item.label))
      .map((item) => `${item.href} → «${item.label}»`);
    expect(
      missing,
      'реестр пересказывает код; пересказ обязан содержать каждый адрес и его имя'
    ).toEqual([]);
  });

  it('список вычисляемых заголовков не протухает', () => {
    const menuHrefs = new Set(navigationModel.map((item) => item.href));
    const stale = Object.keys(COMPUTED_TITLES).filter(
      (href) =>
        !menuHrefs.has(href) ||
        hasTitle(
          titleSourcesOf(pageFileOf(href)),
          navigationModel.find((i) => i.href === href)!.label
        )
    );
    expect(
      stale,
      'запись без пункта меню или уже со статичным заголовком — убрать из списка'
    ).toEqual([]);
  });
});
