import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/**
 * `IA-017`: судьба каждого админского маршрута решена — и решение записано в ТЗ.
 *
 * Таблица §4.7 обещает: все тридцать маршрутов `/admin/*` достижимы, у каждого назван способ
 * («Проверка → вкладка „Тесты“») и признак «редирект: да/нет». Обещание проверял только
 * человек глазами — а маршруты заводятся и переезжают чаще, чем перечитывается ТЗ.
 *
 * Поэтому сторож читает САМУ ТАБЛИЦУ как источник правды и сверяет её с кодом в обе стороны:
 *
 *  - строка таблицы без страницы — обещание, которого никто не исполняет;
 *  - страница без строки — маршрут, заведённый без решения: он не попал ни в меню, ни в
 *    редиректы, и человек найдёт его только по прямой ссылке;
 *  - «редирект: да» без редиректа (и наоборот) — таблица разошлась с поведением, а по ней
 *    считают клики до задачи (§13.2).
 *
 * Сверка с ТЗ, а не со своим списком, — принципиально: свой список пришлось бы держать в
 * согласии с ТЗ вручную, то есть ровно та работа, которую сторож и должен снять.
 */

const SPEC = join(APP_ROOT, '..', '..', 'docs', 'TZ_UI_REDESIGN_TRUDSKILL.md');
const APP_DIR = join(APP_ROOT, 'app');

type SpecRow = { route: string; how: string; redirect: boolean };

/** Таблица §4.7 из ТЗ: маршрут, способ попасть, признак редиректа. */
const specRows = (): SpecRow[] => {
  const text = readFileSync(SPEC, 'utf8');
  const from = text.indexOf('### 4.7.');
  const to = text.indexOf('`ID: IA-018.`');
  if (from === -1 || to === -1) throw new Error('раздел 4.7 в ТЗ не найден');
  const rows: SpecRow[] = [];
  for (const line of text.slice(from, to).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // № | Маршрут | Блок | Как попасть | Кликов | Редирект
    if (cells.length < 7 || !/^\d+$/.test(cells[1] ?? '')) continue;
    const route = (cells[2] ?? '').replace(/`/g, '').trim();
    rows.push({ route, how: cells[4] ?? '', redirect: /да/i.test(cells[6] ?? '') });
  }
  return rows;
};

/** Файл страницы для маршрута (сегменты вида `[id]` — как в таблице). */
const pageFile = (route: string): string =>
  join(APP_DIR, ...route.replace(/^\//, '').split('/'), 'page.tsx');

/** Все существующие маршруты `/admin/*`. */
const adminRoutesOnDisk = (dir: string, prefix = '/admin', acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      adminRoutesOnDisk(full, `${prefix}/${entry}`, acc);
      continue;
    }
    if (entry === 'page.tsx') acc.push(prefix);
  }
  return acc;
};

const rows = specRows();
const onDisk = adminRoutesOnDisk(join(APP_DIR, 'admin'));

describe('IA-017 · судьба каждого админского маршрута решена', () => {
  it('таблица ТЗ прочитана, а не пропущена молча', () => {
    // Если разбор сломается, все проверки ниже станут зелёными на пустоте.
    expect(rows.length, 'строки таблицы §4.7 не разобраны').toBeGreaterThanOrEqual(30);
    expect(
      rows.some((row) => row.redirect),
      'редиректы в таблице не найдены'
    ).toBe(true);
  });

  it('у каждой строки таблицы есть страница', () => {
    const missing = rows
      .filter((row) => !existsSync(pageFile(row.route)))
      .map((row) => `${row.route} — обещан таблицей §4.7, страницы нет`);
    expect(missing).toEqual([]);
  });

  it('у каждой страницы есть строка в таблице', () => {
    const known = new Set(rows.map((row) => row.route));
    const undecided = onDisk
      .filter((route) => !known.has(route))
      .map((route) => `${route} — маршрут заведён без решения в §4.7: как человек его найдёт?`);
    expect(undecided, `маршрутов без решения: ${undecided.length}`).toEqual([]);
  });

  it('«редирект: да» действительно перенаправляет, и туда, куда обещано', () => {
    const wrong: string[] = [];
    for (const row of rows.filter((item) => item.redirect)) {
      const source = readFileSync(pageFile(row.route), 'utf8');
      const target = /redirect\('([^']+)'\)/.exec(source);
      if (!target) {
        wrong.push(`${row.route} — таблица обещает редирект, а страница обычная`);
        continue;
      }
      // Явная цель в таблице («→ `/workspace`») сверяется точно; якорные строки ведут
      // в собранные настройки, и это тоже записано в ТЗ (IA-018).
      const explicit = /`([^`]+)`/.exec(row.how);
      const expected = explicit ? explicit[1]! : '/settings#';
      if (!target[1]!.startsWith(expected)) {
        wrong.push(`${row.route} — ведёт на ${target[1]}, а таблица обещает ${expected}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('«редирект: нет» — это настоящий экран, а не перенаправление', () => {
    const sneaky = rows
      .filter((row) => !row.redirect)
      .filter((row) => /redirect\(/.test(readFileSync(pageFile(row.route), 'utf8')))
      .map((row) => `${row.route} — таблица обещает экран, а страница перенаправляет`);
    expect(sneaky).toEqual([]);
  });
});
