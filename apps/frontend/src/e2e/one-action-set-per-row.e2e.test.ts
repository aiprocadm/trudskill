import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Один набор действий в строке таблицы (ТЗ «Стабилизация, UX и развитие», 5.1 / Э1;
 * канон — `CMP-001`: колонка действий — меню «…»).
 *
 * **Как было.** `DataTable` печатал все действия строки подряд подчёркнутыми ссылками: в
 * «Арендаторах платформы» четыре в ряд — «Включить работу центра», «Приостановить центр»,
 * «Перевести в „В архиве“», «Войти от имени», опасные красным вперемешку с обычными. Канон
 * `CMP-001` анатомию «колонка действий — меню «…»» записал, но в компоненте её не было.
 *
 * **Что закреплено.** Правило живёт один раз в пакете: `splitRowActions` + `OverflowMenu`.
 * В строке максимум одно основное действие (`primary`), остальное — в меню «…», опасные —
 * внизу отдельной секцией, красным. Экраны лишь помечают «Открыть …» основным. Таблицы со
 * своей колонкой «Действия» (кнопки в `render`) — очередь на перевод в `rowActions`, она
 * сверяется на равенство: в 5.6 («один шаблон списка») из неё ушли пять записей из семи,
 * у оставшихся двух в ячейке не кнопка, а поле (см. комментарий к списку).
 */

const TABLE = fromPackages('ui', 'src', 'components', 'table', 'index.tsx');
const MENU = fromPackages('ui', 'src', 'components', 'overflow-menu', 'index.tsx');
const STYLES = fromPackages('ui', 'src', 'styles', 'foundation.ts');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/**
 * Таблицы со своей колонкой «Действия» — кнопки прямо в ячейке, мимо правила. Список
 * сверяется на РАВЕНСТВО: новая такая колонка не проскочит, а переведённая потребует убрать
 * запись.
 *
 * **Путь: 12 → 7 (ТЗ 5.6).** Переведены на `rowActions` пять колонок, где в ячейке были
 * кнопки: эксплуатация (задачи, карантин, письма), оплата, учебные пакеты.
 *
 * Оставшиеся семь **не кнопки, а поля**, и в меню «…» им не место:
 *
 * - `gov-export` (5) — в ячейке стоит ВЫБОР ФАЙЛА («Файл ответа ведомства»). Пункт меню
 *   умеет только «нажали — сделали»; выбрать файл он не может. Замена — панель выгрузки,
 *   в которую этот выбор переедет; экран целиком разбирается в 5.7 («простыни»: пять таблиц
 *   и четыре формы в одной ленте).
 * - `reviewer-actions` (2) — в ячейке стоит ФОРМА ПРОВЕРКИ работы: поля баллов по каждому
 *   эссе, комментарий, ссылки на файлы. Это не действие строки, а рабочий экран внутри
 *   ячейки таблицы. Замена — действие «Проверить работу», открывающее панель с той же
 *   формой; тоже 5.7.
 *
 * Причина у каждой записана здесь, а не «потом разберёмся»: очередь без причины через месяц
 * неотличима от забытой (урок журнала 211).
 */
const CUSTOM_ACTION_COLUMNS: Record<string, number> = {
  'src/features/gov-export/gov-export-screen.tsx': 5,
  'src/features/reviewer-actions/reviewer-actions-screen.tsx': 2
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

/** Тело стрелки `rowActions={(row) => …}` до закрывающей скобки атрибута. */
const rowActionsBlocks = (source: string): string[] => {
  const blocks: string[] = [];
  const re = /rowActions=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(m.index, i + 1));
  }
  return blocks;
};

describe('один набор действий в строке (ТЗ 5.1)', () => {
  it('таблица пакета раскладывает действия по правилу, а не печатает все подряд', () => {
    const table = read(TABLE);
    expect(/splitRowActions\(/.test(table), 'правило разбиения — одно, в пакете').toBe(true);
    expect(/<OverflowMenu\b/.test(table), 'остальные действия — в меню «…»').toBe(true);
    expect(
      /rowActions\(r\)\.map\(/.test(table),
      'все действия подряд ссылками — это и есть «четыре подчёркнутые ссылки в ряд»'
    ).toBe(false);
  });

  it('опасные пункты меню — внизу, отдельной секцией, красным', () => {
    const menu = read(MENU);
    const safeAt = menu.indexOf('{safe.map(renderItem)}');
    const dividerAt = menu.indexOf('ui-overflow-menu__divider');
    const dangerAt = menu.indexOf('{danger.map(renderItem)}');
    expect(safeAt, 'обычные пункты рисуются').toBeGreaterThan(-1);
    expect(dividerAt, 'между секциями — разделитель').toBeGreaterThan(safeAt);
    expect(dangerAt, 'опасные — после разделителя').toBeGreaterThan(dividerAt);
    expect(read(STYLES)).toMatch(/\.ui-overflow-menu__item--danger\s*\{[^}]*--ui-danger/);
  });

  it('на экране не больше одного основного действия в строке', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      for (const block of rowActionsBlocks(read(file))) {
        const primaries = (block.match(/primary:\s*true/g) ?? []).length;
        if (primaries > 1) offenders.push(`${rel(file)}: primary ×${primaries}`);
      }
    }
    expect(offenders, 'в строке — одно основное действие («Открыть»), остальное в меню').toEqual(
      []
    );
  });

  it('очередь таблиц со своей колонкой «Действия» не растёт и не врёт', () => {
    const found: Record<string, number> = {};
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      const n = (read(file).match(/title:\s*'Действия'/g) ?? []).length;
      if (n > 0) found[rel(file)] = n;
    }
    expect(
      found,
      'своя колонка «Действия» — кнопки мимо правила; новые — только через rowActions'
    ).toEqual(CUSTOM_ACTION_COLUMNS);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    expect(existsSync(PATTERNS)).toBe(true);
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э1');
    expect(doc).toContain('`rowActions`');
    expect(doc).toContain('`primary`');
  });
});
