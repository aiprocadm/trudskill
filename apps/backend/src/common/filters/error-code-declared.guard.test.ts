import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Ошибка доносит до человека СВОЙ смысл, а не «сбой сервера».
 *
 * Конверт ответа обещает код: `HttpExceptionErrorBody.code: string`
 * (`packages/api-contracts/src/http/contracts.ts`). CLAUDE.md повторяет это правилом для
 * бэкенда: исключение бросается объектной формой `{ code, message }`. Исполняет обещание
 * тот, кто бросает: `HttpExceptionEnvelopeFilter` кладёт в конверт то, что дал ему Nest.
 *
 * А Nest на строковую форму — `new BadRequestException('Only draft application can be
 * updated')` — отдаёт `{ message, error: 'Bad Request', statusCode: 400 }`. Кода там нет.
 * Фронт, не найдя кода, до ревизии 2026-09-06 подставлял `internal_error`
 * (`lib/errors/api-error.ts`), а словарь `lib/errors/error-text.ts` отвечал на него
 * «Сбой на стороне сервера — с вашими данными ничего не случилось. Повторите через минуту».
 *
 * То есть человек, нажавший «Сохранить» на черновике заявки, читал, что сломался сервер, и
 * жал ещё раз — хотя сервер работал, а мешало состояние записи. Ревизия 2026-09-06 нашла
 * 49 таких бросков в шести файлах: документы (21), электронная подпись (20), чат, вебинары
 * и уведомления (8).
 *
 * Инвариант: у каждого броска HTTP-исключения есть код — литералом или переменной,
 * объявленной рядом. Строковая форма запрещена: она молча превращает домен в «сбой сервера».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');

/** Исключения Nest, тело которых уходит человеку через конверт ошибки. */
const THROW = /throw new ([A-Za-z]*Exception)\s*\(/g;

/** Код ошибки: `snake_case`, как в словаре фронта и в `BackendHttpErrorCodes`. */
const CODE = /^[a-z][a-z0-9_]*$/;

/**
 * Броски, у которых кода нет по причине, — с объяснением.
 *
 * Пусто: ревизия 2026-09-06 разобрала очередь до конца. Это НЕ разрешение — чтобы попасть
 * сюда, нужна причина, а не желание не писать код.
 */
const ALLOWED: Record<string, string> = {};

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.') && !entry.endsWith('.stub.ts')) {
      acc.push(full);
    }
  }
  return acc;
};

/** Индекс закрывающей кавычки строки, начатой в `start`. */
const skipString = (source: string, start: number): number => {
  const quote = source[start]!;
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') index += 1;
    index += 1;
  }
  return index;
};

/** Снимает комментарии, не трогая строки; переводы строк сохраняются — номера не едут. */
const stripComments = (source: string): string => {
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
      out += source.slice(index, stop).replace(/[^\n]/g, '');
      index = stop;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

/** Текст аргументов вызова, чья открывающая скобка стоит в `open`. */
const argumentsOf = (source: string, open: number): string => {
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
      if (depth === 0) return source.slice(open + 1, index);
    }
    index += 1;
  }
  return source.slice(open + 1);
};

/** Аргументы верхнего уровня — по запятым вне скобок и строк. */
const splitTopLevel = (text: string): string[] => {
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

/** Значение свойства объектного литерала; сокращённая запись `{ code }` возвращает имя. */
const propertyValue = (objectText: string, name: string): string | null => {
  const match = new RegExp(`(?:^|[{,\\s])${name}\\s*(:|,|\\n|})`).exec(objectText);
  if (!match) return null;
  if (match[1] !== ':') return name;
  const rest = objectText.slice(match.index + match[0].length);
  return (splitTopLevel(rest)[0] ?? '').replace(/\}\s*$/, '').trim();
};

const literalCodes = (expression: string): string[] =>
  [...expression.matchAll(/'([^']*)'/g)].map((m) => m[1]!).filter((code) => CODE.test(code));

/** Код, собранный из `const` того же файла: `const decision = map[x] ?? 'tenant_suspended'`. */
const codesFromLocalConst = (source: string, name: string): string[] => {
  const declaration = new RegExp(`const\\s+${name}\\s*(?::[^=]+)?=([\\s\\S]*?);`).exec(source);
  return declaration ? literalCodes(declaration[1]!) : [];
};

type Throw = { location: string; exception: string; codes: string[]; shape: string };

const scanThrows = (): Throw[] => {
  const found: Throw[] = [];
  for (const file of sourcesUnder(SRC)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const relativeFile = relative(SRC, file).split('\\').join('/');
    for (const match of source.matchAll(THROW)) {
      const line = source.slice(0, match.index).split('\n').length;
      const location = `${relativeFile}:${line}`;
      const exception = match[1]!;
      const parts = splitTopLevel(argumentsOf(source, match.index + match[0].length - 1));
      const first = parts[0] ?? '';

      if (first.startsWith('{')) {
        const code = propertyValue(first, 'code');
        if (code === null) {
          found.push({ location, exception, codes: [], shape: 'объект без `code`' });
          continue;
        }
        const codes = literalCodes(code);
        if (codes.length) {
          found.push({ location, exception, codes, shape: 'объект' });
          continue;
        }
        if (/^[A-Za-z_$][\w$]*$/.test(code)) {
          const resolved = codesFromLocalConst(source, code);
          found.push({
            location,
            exception,
            codes: resolved,
            shape: resolved.length
              ? `объект, код из \`const ${code}\``
              : `неразобранный код: ${code}`
          });
          continue;
        }
        found.push({ location, exception, codes: [], shape: `неразобранный код: ${code}` });
        continue;
      }

      if (/^['"`]/.test(first)) {
        found.push({ location, exception, codes: [], shape: 'строка вместо `{ code, message }`' });
        continue;
      }
      if (first === '') {
        found.push({ location, exception, codes: [], shape: 'без аргументов' });
        continue;
      }
      found.push({
        location,
        exception,
        codes: [],
        shape: `неразобранная форма: ${first.slice(0, 60)}`
      });
    }
  }
  return found;
};

describe('код ошибки объявлен — кто его кладёт в конверт', () => {
  const throws = scanThrows();

  it('сторож видит броски, а не пустой список', () => {
    // Страховка от немого сторожа: если разбор сломается, тест ниже станет зелёным на пустоте.
    expect(throws.length).toBeGreaterThanOrEqual(360);
  });

  it('у каждого броска HTTP-исключения есть код', () => {
    const naked = throws
      .filter((t) => t.codes.length === 0)
      .filter((t) => !(t.location in ALLOWED));
    const report = naked.map((t) => `${t.location} [${t.exception}] — ${t.shape}`);
    expect(report, `бросков без кода: ${report.length}`).toEqual([]);
  });

  it('код записан как `snake_case`, а не как фраза', () => {
    const odd = throws
      .flatMap((t) => t.codes.map((code) => ({ code, location: t.location })))
      .filter(({ code }) => !CODE.test(code))
      .map(({ code, location }) => `${location} — ${code}`);
    expect(odd).toEqual([]);
  });
});
