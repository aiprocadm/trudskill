import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { DataTable, WIDE_TABLE_MIN_COLUMNS } from '@trudskill/ui';
import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Страница не едет вбок (ТЗ «Стабилизация, UX и развитие», 5.11 / Э11).
 *
 * **Как было.** Карточка курса в окне 1560px имела ширину 2343px: колонки «Вид» и «Минимум
 * просмотра» уезжали за экран, и горизонтальная полоса появлялась у ВСЕЙ страницы — вместе с
 * меню, шапкой и всем остальным (журнал 474).
 *
 * **Причина была не в таблице.** Элемент сетки или флекса по умолчанию имеет `min-width: auto`
 * — то есть не может сжаться уже своего содержимого. Обёртка таблицы со своей прокруткой
 * (`overflow-x: auto`) поэтому не прокручивалась, а просто росла и растягивала карточку,
 * страницу и оболочку. Прокрутка внутри блока была написана и не работала — ровно как
 * «липкая» панель в 5.5.
 *
 * **Что закреплено.**
 *
 * 1. Страница, карточка секции и стопка позволяют широкому содержимому сжиматься
 *    (`min-width: 0`) — тогда его собственная прокрутка включается.
 * 2. Горизонтальной прокрутки на уровне страницы нет: её не объявляют ни страница, ни
 *    оболочка.
 * 3. Широкая таблица закрепляет первую колонку САМА — иначе, прокручивая вбок, человек
 *    теряет из виду, о ком строка.
 * 4. Жёсткие ширины в пикселях не растут: экран, который нельзя сузить, едет вбок.
 */

const FOUNDATION = fromPackages('ui', 'src', 'styles', 'foundation.ts');
const TABLES = fromPackages('ui', 'src', 'styles', 'tables.ts');
const SHELL = fromPackages('ui', 'src', 'styles', 'shell.ts');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/**
 * Жёсткие ширины в разметке экранов: сверяется на РАВЕНСТВО.
 *
 * Каждая такая ширина — обещание «этот кусок не сузится». Пока их мало и они узкие (220–280px
 * у полей формы), страница помещается; список не даёт им расти незаметно.
 */
const FIXED_WIDTHS: Record<string, number> = {
  'src/features/integrations/screens.tsx': 3,
  'src/features/notification-recipients/screens.tsx': 1
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/**
 * Текст таблицы стилей БЕЗ комментариев.
 *
 * Общий `stripComments` тут не годится: он пропускает содержимое строк, а файл стилей —
 * одна строка-шаблон, внутри которой живёт весь CSS вместе со своими комментариями
 * (урок журнала 468).
 */
const readCss = (file: string): string => {
  const source = readFileSync(file, 'utf8');
  /*
   * Отбрасывается обёртка модуля (`export const … = \``): без этого первым «селектором»
   * первого правила становится строка объявления, и правило по имени не находится —
   * поймано подсаженной поломкой на чистом дереве (журнал 476).
   */
  const first = source.indexOf('`');
  const last = source.lastIndexOf('`');
  const css = first === -1 || last <= first ? source : source.slice(first + 1, last);
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
};

/** Правила таблицы стилей: селекторы + тело. */
const cssRules = (source: string): Array<{ selectors: string[]; body: string }> => {
  const rules: Array<{ selectors: string[]; body: string }> = [];
  let cursor = 0;
  for (;;) {
    const open = source.indexOf('{', cursor);
    if (open === -1) break;
    const close = source.indexOf('}', open);
    if (close === -1) break;
    rules.push({
      selectors: source
        .slice(cursor, open)
        .split(',')
        .map((line) => line.trim())
        .filter(Boolean),
      body: source.slice(open, close)
    });
    cursor = close + 1;
  }
  return rules;
};

/** Разрешено ли сжиматься содержимому этого селектора. */
const canShrink = (source: string, selector: string): boolean =>
  cssRules(source).some(
    (rule) => rule.selectors.includes(selector) && /min-width:\s*0\b/.test(rule.body)
  );

describe('страница не едет вбок (ТЗ 5.11)', () => {
  it('широкому содержимому возвращено право сжиматься', () => {
    /*
     * Без этого обёртка таблицы со своей прокруткой просто растёт: прокрутка написана и
     * не работает. Проверяются оба уровня — и сами контейнеры, и их дети.
     */
    const source = readCss(FOUNDATION);
    for (const selector of ['.ui-page', '.ui-section-card']) {
      expect(canShrink(source, selector), `${selector} обязан уметь сжиматься`).toBe(true);
    }
    for (const selector of ['.ui-page > *', '.ui-section-card > *', '.ui-stack > *']) {
      expect(canShrink(source, selector), `дети ${selector} обязаны уметь сжиматься`).toBe(true);
    }
  });

  it('широкая таблица прокручивается ВНУТРИ своего блока', () => {
    const rule = cssRules(readCss(TABLES)).find((one) => one.selectors.includes('.ui-table-wrap'));
    expect(rule, 'обёртка таблицы обязана существовать').toBeDefined();
    expect(rule!.body).toContain('overflow-x: auto');
  });

  it('горизонтальной прокрутки на уровне страницы нет', () => {
    const pageRules = cssRules(readCss(FOUNDATION)).filter((rule) =>
      rule.selectors.some((one) => one === '.ui-page' || one === '.ui-page-container')
    );
    for (const rule of pageRules) {
      expect(
        /overflow-x:\s*(auto|scroll)/.test(rule.body),
        'полоса прокрутки у всей страницы — это и есть дефект ТЗ 5.11'
      ).toBe(false);
    }
    const shellRules = cssRules(readCss(SHELL)).filter((rule) =>
      rule.selectors.some((one) => one === '.app-shell' || one === '.app-shell__content')
    );
    for (const rule of shellRules) {
      expect(/overflow-x:\s*(auto|scroll)/.test(rule.body)).toBe(false);
    }
  });

  it('широкая таблица закрепляет первую колонку САМА', () => {
    // Возможность была и раньше, но её не включал ни один экран (журнал 475).
    const wide = Array.from({ length: WIDE_TABLE_MIN_COLUMNS }, (_unused, index) => ({
      key: `c${index}` as const,
      title: `Колонка ${index}`
    }));
    const el = DataTable({ columns: wide as never, rows: [] as never[] });
    expect(JSON.stringify(el)).toContain('ui-table-wrap--sticky-first');
  });

  it('узкая таблица первую колонку не закрепляет', () => {
    // Закрепление у таблицы из трёх колонок — лишняя тень посреди экрана.
    const narrow = [
      { key: 'a' as const, title: 'А' },
      { key: 'b' as const, title: 'Б' },
      { key: 'c' as const, title: 'В' }
    ];
    const el = DataTable({ columns: narrow as never, rows: [] as never[] });
    expect(JSON.stringify(el)).not.toContain('ui-table-wrap--sticky-first');
  });

  it('экран может настоять на своём решении о закреплении', () => {
    const wide = Array.from({ length: WIDE_TABLE_MIN_COLUMNS }, (_unused, index) => ({
      key: `c${index}` as const,
      title: `Колонка ${index}`
    }));
    const el = DataTable({
      columns: wide as never,
      rows: [] as never[],
      stickyFirstColumn: false
    });
    expect(JSON.stringify(el)).not.toContain('ui-table-wrap--sticky-first');
  });

  it('закреплённая колонка не теряется на телефоне', () => {
    /*
     * На ≤480px таблица превращается в карточки и прокрутки вбок нет — закрепление там
     * бессмысленно и только рисовало бы тень поперёк карточки.
     */
    const phone = readCss(TABLES).slice(readCss(TABLES).indexOf('@media (max-width: 480px)'));
    expect(phone).toContain('.ui-table-wrap--sticky-first');
    expect(phone).toContain('position: static');
  });

  it('жёсткие ширины в разметке не растут', () => {
    const found: Record<string, number> = {};
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      /*
       * `minWidth: 0` — это НЕ жёсткая ширина, а ровно то, что чинит эту задачу: разрешение
       * сжиматься. Первая редакция образца записала его в долг вместе с настоящими ширинами.
       */
      const n = (read(file).match(/minWidth:\s*[1-9]\d*|width:\s*\d{3,}/g) ?? []).length;
      if (n > 0) found[rel(file)] = n;
    }
    expect(
      found,
      'жёсткая ширина — обещание «этот кусок не сузится»; такие обещания не должны копиться'
    ).toEqual(FIXED_WIDTHS);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э11');
    expect(doc).toContain('min-width: 0');
  });
});
