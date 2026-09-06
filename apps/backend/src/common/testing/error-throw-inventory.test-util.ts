import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Инвентарь бросков HTTP-ошибок бэкенда — статическим разбором исходников.
 *
 * Общий для сторожей семейства «ошибка доносит свой смысл»:
 *  - `error-code-declared.guard.test.ts` (§5.421) — у каждого броска есть код;
 *  - `error-status-matches-code.guard.test.ts` (§5.422+) — статус отвечает коду.
 *
 * Разбор строкоустойчивый: комментарии снимаются без сдвига номеров строк, кавычки не
 * путаются со скобками и запятыми. Регулярное выражение поверх сырого файла врало бы —
 * пример кода в комментарии считался бы кодом.
 *
 * Тот же разбор во фронте живёт отдельно (`apps/frontend/src/e2e/backend-source.ts`): тащить
 * модуль через границу приложения хуже, чем держать две копии, — фронт не зависит от бэкенда.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `apps/backend/src` — от файла, а не от текущего каталога (CLAUDE.md, грабля путей). */
export const BACKEND_SRC = resolve(HERE, '..', '..');

/** Код ошибки: `snake_case`, как в словаре фронта и в `BackendHttpErrorCodes`. */
export const CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

const THROW = /throw new ([A-Za-z]*Exception)\s*\(/g;

/** Исключения Nest → статус ответа. */
const STATUS_BY_EXCEPTION: Record<string, number> = {
  BadRequestException: 400,
  UnauthorizedException: 401,
  ForbiddenException: 403,
  NotFoundException: 404,
  NotAcceptableException: 406,
  ConflictException: 409,
  GoneException: 410,
  PreconditionFailedException: 412,
  PayloadTooLargeException: 413,
  UnsupportedMediaTypeException: 415,
  UnprocessableEntityException: 422,
  InternalServerErrorException: 500,
  ServiceUnavailableException: 503
};

const HTTP_STATUS_NAMES: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

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
  [...expression.matchAll(/'([^']*)'/g)].map((m) => m[1]!).filter((code) => CODE_SHAPE.test(code));

/** Статус у `new HttpException(body, HttpStatus.CONFLICT)` — из второго аргумента. */
const statusFromArgument = (argument: string | undefined): number | null => {
  if (!argument) return null;
  const numeric = /^\s*(\d{3})\s*$/.exec(argument);
  if (numeric) return Number(numeric[1]);
  const named = /HttpStatus\.([A-Z_]+)/.exec(argument);
  return named ? (HTTP_STATUS_NAMES[named[1]!] ?? null) : null;
};

/** Код, собранный из `const` того же файла: `const decision = map[x] ?? 'tenant_suspended'`. */
const codesFromLocalConst = (source: string, name: string): string[] => {
  const declaration = new RegExp(`const\\s+${name}\\s*(?::[^=]+)?=([\\s\\S]*?);`).exec(source);
  return declaration ? literalCodes(declaration[1]!) : [];
};

export type ErrorThrow = {
  /** `modules/documents/documents.service.ts:213`. */
  location: string;
  exception: string;
  /** Коды, найденные у броска; пусто — код не проставлен или не разобран. */
  codes: string[];
  /** Статус ответа; `null` — вывести не удалось. */
  status: number | null;
  /** Как записан бросок — для внятного отказа сторожа. */
  shape: string;
};

export const errorThrows = (root: string = BACKEND_SRC): ErrorThrow[] => {
  const found: ErrorThrow[] = [];
  for (const file of sourcesUnder(root)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const relativeFile = relative(root, file).split('\\').join('/');
    for (const match of source.matchAll(THROW)) {
      const line = source.slice(0, match.index).split('\n').length;
      const location = `${relativeFile}:${line}`;
      const exception = match[1]!;
      const parts = splitTopLevel(argumentsOf(source, match.index + match[0].length - 1));
      const first = parts[0] ?? '';
      const status = STATUS_BY_EXCEPTION[exception] ?? statusFromArgument(parts[1]);
      const at = (codes: string[], shape: string): ErrorThrow => ({
        location,
        exception,
        codes,
        status,
        shape
      });

      if (first.startsWith('{')) {
        const code = propertyValue(first, 'code');
        if (code === null) {
          found.push(at([], 'объект без `code`'));
          continue;
        }
        const codes = literalCodes(code);
        if (codes.length) {
          found.push(at(codes, 'объект'));
          continue;
        }
        if (/^[A-Za-z_$][\w$]*$/.test(code)) {
          const resolved = codesFromLocalConst(source, code);
          found.push(
            at(
              resolved,
              resolved.length ? `объект, код из \`const ${code}\`` : `неразобранный код: ${code}`
            )
          );
          continue;
        }
        found.push(at([], `неразобранный код: ${code}`));
        continue;
      }
      if (/^['"`]/.test(first)) {
        found.push(at([], 'строка вместо `{ code, message }`'));
        continue;
      }
      if (first === '') {
        found.push(at([], 'без аргументов'));
        continue;
      }
      found.push(at([], `неразобранная форма: ${first.slice(0, 60)}`));
    }
  }
  return found;
};
