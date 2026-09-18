import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Один шаблон списка для всех списков (ТЗ «Стабилизация, UX и развитие», 5.6 / Э6).
 *
 * **Как было.** Каркас `ListPage` существовал и рисовал таблицу, страницы и состояния, но
 * всё, что вокруг таблицы, каждый экран собирал сам и ставил рядом: быстрые отборы, панель
 * поиска и фильтров, выбор колонок, полосу массовых действий. Порядок блоков жил в памяти
 * автора экрана, а не в коде, — и разошёлся: «Слушатели» имели поиск, отборы, выбор колонок
 * и галочки, «Группы» — ни поиска, ни фильтров вовсе, «Пользователи» — отбор по роли без
 * колонки «Роль». Пагинация «Назад 1 / 1 Вперёд» висела под списком из одной строки.
 *
 * **Что закреплено.**
 *
 * 1. Порядок блоков считает каркас: быстрые отборы → поиск и фильтры → выбор колонок →
 *    таблица → страницы → массовые действия. Экран передаёт содержимое слотами.
 * 2. Ни один экран не рисует эти блоки рядом с каркасом — собрать список в другом порядке
 *    нельзя.
 * 3. Пагинация не показывается, когда страница одна.
 * 4. Колонки соответствуют доступным фильтрам: отбор по роли — и колонка «Роль».
 * 5. «Группы» умеют искать и отбирать по статусу.
 */

const FRAME = fromPackages('ui', 'src', 'composition', 'list-page.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const GROUPS = fromApp('src', 'features', 'groups', 'groups-list-screen.tsx');
const USERS = fromApp('src', 'features', 'users', 'users-screens.tsx');
const USERS_API = fromApp('..', 'backend', 'src', 'modules', 'iam', 'auth.controller.ts');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Блоки списка, которые обязаны приходить каркасу слотом, а не стоять рядом с ним. */
const LIST_BLOCKS = ['<SavedViews', '<ColumnPicker', '<BulkActionBar', '<FilterBar'];

/**
 * Экраны, где блок списка пока стоит рядом с каркасом. Сверяется на РАВЕНСТВО: новый такой
 * экран не проскочит, а исправленный потребует убрать запись. У каждой записи — причина.
 */
const BLOCKS_BESIDE_FRAME: Record<string, string> = {
  'app/crm/deals/page.tsx':
    'Это не панель отбора, а ФОРМА создания сделки (два выбора и кнопка «Создать сделку»), ' +
    'одетая в FilterBar и стоящая в другой секции. Ей место в панели, а не над таблицей, — ' +
    'разбирается вместе со страницей в 5.7 (журнал 456).'
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
 * Диапазоны открывающего тега `<ListPage … />` — по глубине ФИГУРНЫХ скобок.
 *
 * Обобщение (`<ListPage<Строка>`) пропускается отдельно. Первая редакция этого замера его
 * не пропускала: угловая скобка обобщения обрывала тег на первом же символе, и экраны,
 * уже собранные из слотов, выглядели нарушителями (журнал 457). Третий случай подряд, когда
 * конец конструкции нельзя искать наивно, — см. журнал 445 и 447.
 */
const frameRanges = (source: string): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  const re = /<ListPage[\s<>/]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let j = m.index + m[0].length - 1;
    if (source[j] === '<') {
      let angle = 0;
      for (; j < source.length; j += 1) {
        if (source[j] === '<') angle += 1;
        else if (source[j] === '>') {
          angle -= 1;
          if (angle === 0) {
            j += 1;
            break;
          }
        }
      }
    }
    let depth = 0;
    for (; j < source.length; j += 1) {
      const ch = source[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    ranges.push([m.index, j]);
  }
  return ranges;
};

/** Экраны, собирающие список каркасом. */
const listScreens = (): Array<{ file: string; source: string }> =>
  ROOTS.flatMap((root) => collect(root))
    .map((file) => ({ file, source: read(file) }))
    .filter(({ source }) => source.includes('<ListPage'));

describe('один шаблон списка для всех списков (ТЗ 5.6)', () => {
  it('порядок блоков задаёт каркас, а не экран', () => {
    const frame = read(FRAME);
    const order = ['savedViews ??', '<FilterBar', '<AsyncSection', 'bulkBar ??'];
    const positions = order.map((needle) => frame.indexOf(needle));
    expect(
      positions.every((at) => at > -1),
      `не все блоки на месте: ${order.join(', ')}`
    ).toBe(true);
    expect(
      [...positions].sort((a, b) => a - b),
      'быстрые отборы → фильтры → таблица → массовые действия, и никак иначе'
    ).toEqual(positions);
  });

  it('пагинация не показывается, когда страница одна', () => {
    expect(
      /totalPages\s*!==\s*undefined[\s\S]{0,120}totalPages\s*>\s*1/.test(read(FRAME)),
      '«Назад 1 / 1 Вперёд» под списком из одной строки не сообщает ничего'
    ).toBe(true);
  });

  it('блоки списка приходят каркасу слотом, а не стоят рядом с ним', () => {
    const screens = listScreens();
    expect(screens.length, 'экраны со списками обязаны находиться').toBeGreaterThan(15);
    const beside: string[] = [];
    for (const { file, source } of screens) {
      const inside = frameRanges(source);
      const loose = LIST_BLOCKS.some((tag) => {
        const re = new RegExp(`${tag}[\\s>/]`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(source)) !== null) {
          const at = m.index;
          if (!inside.some(([a, b]) => at >= a && at <= b)) return true;
        }
        return false;
      });
      if (loose) beside.push(rel(file));
    }
    expect(beside.sort(), 'блок рядом с каркасом = порядок блоков снова на совести экрана').toEqual(
      Object.keys(BLOCKS_BESIDE_FRAME).sort()
    );
  });

  it('у каждой записи очереди есть причина, а не «потом разберёмся»', () => {
    for (const [screen, reason] of Object.entries(BLOCKS_BESIDE_FRAME)) {
      expect(reason.length, `${screen}: причина обязана быть развёрнутой`).toBeGreaterThan(60);
    }
  });

  it('«Группы» умеют искать и отбирать по статусу', () => {
    const source = read(GROUPS);
    expect(source, 'поиск по названию и коду').toContain('<SearchInput');
    expect(/aria-label="Статус"/.test(source), 'отбор по статусу').toBe(true);
    expect(
      /useGroupsList\(\{[\s\S]{0,200}\?\s*\{\s*q\s*\}/.test(source),
      'поиск обязан уходить НА СЕРВЕР: отбор на клиенте фильтрует одну страницу и врёт'
    ).toBe(true);
    expect(/\?\s*\{\s*status\s*\}/.test(source), 'статус обязан уходить на сервер').toBe(true);
  });

  it('«Пользователи»: есть отбор по роли — есть и колонка «Роль»', () => {
    const screen = read(USERS);
    expect(/<span className="ui-field-label">Роль<\/span>/.test(screen), 'отбор по роли').toBe(
      true
    );
    expect(/title:\s*'Роль'/.test(screen), 'колонка «Роль» в таблице').toBe(true);
    expect(screen, 'роль печатается русским названием, а не кодом').toContain('roleNamesRu');
    expect(
      read(USERS_API),
      'колонки нечем наполнить, пока список пользователей не отдаёт роли'
    ).toContain('roleCodesOfUsers');
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э6');
    expect(doc).toContain('ListPage');
  });
});
