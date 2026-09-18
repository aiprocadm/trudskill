import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Панель массовых действий липнет к низу экрана и предлагает больше одного красного действия
 * (ТЗ «Стабилизация, UX и развитие», 5.5 / Э5).
 *
 * **Как было.** Панель «Выделено: 1 / Архивировать / Снять выделение» появлялась ПОД таблицей,
 * ниже пагинации: выделив строку вверху списка, человек её не видел. В стилях стояло
 * «position: sticky; bottom: 0» — и это не работало ни разу: панель идёт ПОСЛЕДНИМ элементом
 * страницы, а прилипание снизу у последнего ребёнка не даёт ничего (двигаться некуда — его
 * обычное место и есть низ родителя). Правило было записано, но не действовало.
 *
 * Единственным действием было красное «Архивировать»: выделять двадцать человек, чтобы
 * отправить их в архив, — не та работа, ради которой заводят реестр.
 *
 * **Что закреплено.**
 *
 * 1. Панель — «fixed» по низу окна, слева отступает на ширину колонки меню (переменная
 *    `--ui-shell-nav`), под неё остаётся место в потоке (распорка).
 * 2. Ширина колонки меню — одна переменная на все состояния оболочки: панель не может
 *    разъехаться с колонкой, потому что читает то же число.
 * 3. У каждой панели в приложении больше одного действия, и хотя бы одно НЕ опасное
 *    показывается БЕЗУСЛОВНО — не за правом: иначе у другой роли снова останется одно красное.
 * 4. Опасное действие печатается последним — порядок считает компонент.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];
const TABLES = fromPackages('ui', 'src', 'styles', 'tables.ts');
const SHELL_STYLES = fromPackages('ui', 'src', 'styles', 'shell.ts');
const BAR = fromPackages('ui', 'src', 'components', 'bulk-action-bar', 'index.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

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

/** Правило CSS целиком: от селектора до закрывающей фигурной скобки. */
const cssRule = (source: string, selector: string): string => {
  const at = source.indexOf(`${selector} {`);
  if (at === -1) return '';
  const end = source.indexOf('}', at);
  return end === -1 ? '' : source.slice(at, end);
};

/**
 * Тело `actions={[ … ]}` — по БАЛАНСУ скобок, а не до первой закрывающей.
 *
 * Урок ТЗ 5.4: наивный поиск конца конструкции обрывается на стрелке обработчика, и сторож
 * молча проверяет половину. Здесь считается глубина.
 */
const actionBlocks = (source: string): string[] => {
  const blocks: string[] = [];
  const re = /actions=\{\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let i = source.indexOf('[', m.index);
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '[' || ch === '{' || ch === '(') depth += 1;
      else if (ch === ']' || ch === '}' || ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(m.index, i + 1));
  }
  return blocks;
};

/**
 * Список действий, разобранный на элементы верхнего уровня.
 *
 * `conditional: true` — элемент внесён через `...(условие ? [ … ] : [])`, то есть у роли без
 * права его не будет вовсе. Такие действия не считаются обещанием: панель обязана быть полезной
 * КАЖДОМУ, кто её видит.
 */
const actionItems = (block: string): Array<{ text: string; conditional: boolean }> => {
  const open = block.indexOf('[');
  if (open === -1) return [];
  const items: Array<{ text: string; conditional: boolean }> = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < block.length; i += 1) {
    const ch = block[i];
    if (ch === '[' || ch === '{' || ch === '(') depth += 1;
    else if (ch === ']' || ch === '}' || ch === ')') {
      depth -= 1;
      if (depth === 0) {
        const text = block.slice(start, i).trim();
        if (text) items.push({ text, conditional: text.startsWith('...') });
        break;
      }
    } else if (ch === ',' && depth === 1) {
      const text = block.slice(start, i).trim();
      if (text) items.push({ text, conditional: text.startsWith('...') });
      start = i + 1;
    }
  }
  return items;
};

/** Экраны, где стоит панель массовых действий. */
const screensWithBar = (): Array<{ file: string; source: string }> =>
  ROOTS.flatMap((root) => collect(root))
    .map((file) => ({ file, source: read(file) }))
    .filter(({ source }) => /<BulkActionBar\b/.test(source));

describe('панель массовых действий липкая и полезная (ТЗ 5.5)', () => {
  it('панель прилипает к низу ОКНА, а не стоит последней строкой страницы', () => {
    const rule = cssRule(read(TABLES), '.ui-bulk-bar');
    expect(rule, 'правило .ui-bulk-bar обязано существовать').not.toBe('');
    expect(
      /position:\s*fixed/.test(rule),
      'у последнего элемента страницы «sticky; bottom: 0» не даёт ничего — панель так и стоит под пагинацией'
    ).toBe(true);
    expect(/bottom:\s*0/.test(rule)).toBe(true);
    expect(
      /left:\s*var\(--ui-shell-nav/.test(rule),
      'панель обязана отступать на ширину колонки меню, иначе она наезжает на меню'
    ).toBe(true);
  });

  it('под панель остаётся место в потоке — иначе она накрывает последние строки', () => {
    expect(cssRule(read(TABLES), '.ui-bulk-bar-spacer')).toMatch(/height:\s*\d+px/);
    expect(read(BAR)).toContain('ui-bulk-bar-spacer');
  });

  it('ширина колонки меню — одна переменная на все состояния оболочки', () => {
    const shell = read(SHELL_STYLES);
    const declarations = [...shell.matchAll(/--ui-shell-nav:\s*([^;]+);/g)].map((m) =>
      m[1]!.trim()
    );
    expect(
      declarations,
      'обычная колонка, свёрнутая и телефон — три состояния, и все через переменную'
    ).toEqual(['260px', '64px', '0px']);
    expect(
      /grid-template-columns:\s*260px/.test(shell),
      'ширина числом в сетке — панель разъедется с колонкой при первой же правке'
    ).toBe(false);
  });

  it('счётчик выделенных и порядок «опасное последним» считает компонент', () => {
    const bar = read(BAR);
    expect(bar).toContain('Выделено: {selectedCount}');
    expect(
      /\[\.\.\.actions\.filter\(\(a\) => !a\.danger\), \.\.\.actions\.filter\(\(a\) => a\.danger\)\]/.test(
        bar.replace(/\s+/g, ' ')
      ),
      'порядок обязан считать компонент, а не каждый вызывающий'
    ).toBe(true);
  });

  it('у каждой панели больше одного действия и хотя бы одно полезное — БЕЗУСЛОВНО', () => {
    const screens = screensWithBar();
    expect(screens.length, 'панели в приложении обязаны находиться').toBeGreaterThan(1);
    const poor: string[] = [];
    for (const { file, source } of screens) {
      for (const block of actionBlocks(source)) {
        const items = actionItems(block);
        /*
         * Считать все подписи подряд мало: действие под правом (`...(можно ? [ … ] : [])`)
         * у другой роли исчезает, и в панели снова остаётся одно красное. Поймано подсаженной
         * поломкой — сторож на ней промолчал (журнал 450). Полезное действие обязано быть
         * БЕЗУСЛОВНЫМ, иначе обещание «панель полезна» верно не для всех.
         */
        const usefulAlways = items.filter(
          (item) => !item.conditional && !/danger:\s*true/.test(item.text)
        ).length;
        if (items.length < 2 || usefulAlways < 1) {
          poor.push(`${rel(file)}: действий ${items.length}, безусловных полезных ${usefulAlways}`);
        }
      }
    }
    expect(
      poor,
      'ТЗ 5.5: панель показывает 3–5 ПОЛЕЗНЫХ действий, а не одно красное «Архивировать». ' +
        'Хотя бы одно полезное обязано показываться любой роли, которой доступна сама панель'
    ).toEqual([]);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э5');
    expect(doc).toContain('--ui-shell-nav');
  });
});
