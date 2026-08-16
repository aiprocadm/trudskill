import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Запись выводится ОДИН раз, действия живут в строке (`CMP-001`).
 *
 * Приём, который повторился четыре раза: под таблицей идёт второй проход по тем же данным —
 * список строк с кнопками. Двадцать записей занимают сорок строк, а действие открывается
 * только из нижнего дубля. Впервые найдено в реестре пользователей (срез 17), затем у
 * арендаторов платформы, в счетах аренды, в библиотеке программ и в сделках.
 *
 * Худший случай — сделки: нижний список не называл сделку вообще, только стадию. Понять,
 * какая строка чья, можно было лишь по порядку — одна оплошность и переведена чужая сделка.
 *
 * Сторож ищет признак: в файле есть таблица, и в нём же — проход `.map()`, рисующий строку
 * `ui-inline` с кнопкой. Это не доказательство дубля, а сигнал «посмотри сюда»: список
 * действий рядом с таблицей почти всегда означает второй вывод тех же записей.
 */

const ROOTS = [fromApp('src'), fromApp('app')];
const HAS_TABLE = /<(?:DataTable|ListPage)\b/;
/** Проход по данным, который рисует строку-обёртку с действиями. */
const ROW_LIST = /\.map\(\((\w+)[^)]*\)\s*=>\s*\(\s*<(?:div|li)[^>]*className="ui-inline"/;

/** Известные места на момент среза 24. Пусто — беда вычищена целиком. */
const KNOWN: Record<string, string> = {};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

const files = ROOTS.flatMap((root) => collect(root));

describe('запись выводится один раз, действия — в строке (CMP-001)', () => {
  const offenders = files
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      if (!HAS_TABLE.test(source)) return false;
      const match = ROW_LIST.exec(source);
      if (!match) return false;
      // Кнопка должна быть внутри самого прохода, а не где-то дальше по файлу.
      return source.slice(match.index, match.index + 900).includes('<button');
    })
    .map((file) => relative(APP_ROOT, file).replace(/\\/g, '/'))
    .sort();

  it('под таблицей нет второго списка тех же записей с кнопками', () => {
    const unexpected = offenders.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'запись выводится дважды — перенесите действия в rowActions таблицы'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  /*
   * Без этой проверки сторож остался бы зелёным, если действия строки просто перестанут
   * применять: «дублей нет» и «таблиц с действиями нет» выглядели бы одинаково.
   */
  it('действия строки действительно используются', () => {
    const withRowActions = files.filter((file) => /rowActions=/.test(readFileSync(file, 'utf8')));
    expect(withRowActions.length).toBeGreaterThanOrEqual(8);
  });
});
