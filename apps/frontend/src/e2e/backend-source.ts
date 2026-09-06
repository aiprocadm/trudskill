import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { APP_ROOT } from './app-root';

/**
 * Разбор исходников бэкенда с диска — общие помощники сторожей семейства «объявлено в
 * бэкенде — доносит ли это фронт до человека».
 *
 * Зачем отдельный модуль. Сторожа этого семейства читают `apps/backend/src` как текст: собрать
 * сборкой нельзя (фронт не зависит от бэкенда), а регулярное выражение поверх сырого файла
 * врёт — комментарий с примером кода считается кодом, а `audit.audit_log (` внутри SQL-строки
 * считается вызовом. Поэтому разбор строкоустойчивый: строковые литералы не путаются со
 * скобками и запятыми, комментарии снимаются без сдвига номеров строк.
 *
 * Помощники написаны для `audit-inventory.ts` (§5.420), повторены в
 * `error-code-declared.guard.test.ts` бэкенда (§5.421) и понадобились третий раз для
 * `error-code-inventory.ts` (§5.422) — тогда и вынесены сюда. Копия в бэкенде остаётся своей:
 * тащить её через границу приложения было бы хуже дублирования.
 */

/** `apps/backend/src` — относительно `apps/frontend`. */
export const BACKEND_SRC = join(APP_ROOT, '..', 'backend', 'src');

/** Все `.ts` под каталогом, кроме тестов и заглушек. */
export const sourcesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourcesUnder(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.') && !entry.endsWith('.stub.ts')) {
      out.push(full);
    }
  }
  return out;
};

/** Индекс закрывающей кавычки строки, начатой в `start`. */
export const skipString = (source: string, start: number): number => {
  const quote = source[start]!;
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') index += 1;
    index += 1;
  }
  return index;
};

/** Снимает комментарии, не трогая строки (в строках бывают `//` — адреса). */
export const stripComments = (source: string): string => {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "'" || char === '"' || char === '`') {
      const end = skipString(source, index);
      out += source.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      // Переводы строк сохраняются, чтобы номера строк не поехали.
      out += source.slice(index, stop).replace(/[^\n]/g, '');
      index = stop;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

/** Та же строка, но содержимое строковых литералов заменено пробелами — индексы совпадают. */
export const maskStrings = (source: string): string => {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "'" || char === '"' || char === '`') {
      const end = skipString(source, index);
      out += char + ' '.repeat(Math.max(0, end - index - 1)) + (end < source.length ? char : '');
      index = end + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

/** Текст аргументов вызова, чья открывающая скобка стоит в `open`, и индекс закрывающей. */
export const argumentsOf = (source: string, open: number): { text: string; close: number } => {
  let depth = 0;
  let index = open;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(source, index) + 1;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return { text: source.slice(open + 1, index), close: index };
    }
    index += 1;
  }
  return { text: source.slice(open + 1), close: source.length };
};

/** Аргументы верхнего уровня — по запятым вне скобок и строк. */
export const splitTopLevel = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === "'" || char === '"' || char === '`') {
      const end = skipString(text, index);
      current += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim()) out.push(current);
  return out.map((part) => part.trim());
};

/**
 * Значение свойства объектного литерала — до запятой верхнего уровня. Сокращённая запись
 * `{ action, … }` возвращает имя свойства — это проброс одноимённого параметра обёртки.
 */
export const propertyValue = (objectText: string, name: string): string | null => {
  const match = new RegExp(`(?:^|[{,\\s])${name}\\s*(:|,|\\n|})`).exec(objectText);
  if (!match) return null;
  if (match[1] !== ':') return name;
  const rest = objectText.slice(match.index + match[0].length);
  const [value] = splitTopLevel(rest);
  return (value ?? '').replace(/\}\s*$/, '').trim();
};

/** Строковые литералы выражения, подходящие под форму. */
export const literalsIn = (expression: string, shape: RegExp): string[] =>
  [...expression.matchAll(/'([^']*)'/g)].map((m) => m[1]!).filter((value) => shape.test(value));
