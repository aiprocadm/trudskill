import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `CMP-001`: флажки в реестре стоят только там, где за ними есть массовое действие.
 *
 * Правило пришло из реестра групп. Каркас списка умеет выделять строки с волны 4, и соблазн
 * включить флажки «раз уж есть» велик. Но выделение без операции — обман: человек отмечает
 * двадцать строк, ищет глазами, что с ними сделать, и не находит ничего. Именно поэтому в
 * группах флажки два месяца стояли ВЫКЛЮЧЕННЫМИ, пока 08.09.2026 не появилась серверная
 * ручка массового закрытия.
 *
 * Обратная сторона тоже проверяется: полоса массовых действий без выделения — панель,
 * которая никогда не покажется.
 *
 * Граница сторожа названа честно: он видит НАЛИЧИЕ полосы в разметке, а не её достижимость.
 * Обернуть её в заведомо ложное условие он не поймает — для этого нужен запуск экрана,
 * которого в этом наборе нет (`RISK-002`). Ловится настоящий случай: полосу удалили, а
 * флажки забыли выключить.
 */

const SOURCE = fromApp('src');

const screens = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      screens(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Исходник без комментариев: пояснение про флажки — не разметка. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const files = screens(SOURCE).map((file) => ({
  name: relative(APP_ROOT, file),
  code: codeOnly(readFileSync(file, 'utf8'))
}));

/**
 * Выделение включено. Проп пишут двумя способами — голым `selectable` и через условие
 * `{...(можно ? { selectable: true, … } : {})}`, — поэтому ищется само слово в коде без
 * комментариев, а не одна из двух его форм: иначе сторож молчал бы на половине экранов.
 */
const hasSelection = (code: string): boolean => /\bselectable\b/.test(code);
const hasBulkBar = (code: string): boolean => /<BulkActionBar\b/.test(code);

describe('CMP-001 · выделение строк и массовое действие ходят парой', () => {
  it('экраны вообще найдены', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('у каждого выделения есть массовое действие', () => {
    const lying = files
      .filter((f) => hasSelection(f.code) && !hasBulkBar(f.code))
      .map((f) => f.name);
    expect(
      lying,
      'флажки без операции: человек отметит строки и не найдёт, что с ними сделать'
    ).toEqual([]);
  });

  it('у каждой полосы массовых действий есть выделение', () => {
    const orphan = files
      .filter((f) => hasBulkBar(f.code) && !hasSelection(f.code))
      .map((f) => f.name);
    expect(orphan, 'полоса массовых действий, которую нечем наполнить').toEqual([]);
  });
});
