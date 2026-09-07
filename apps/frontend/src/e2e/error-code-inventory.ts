import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

import {
  BACKEND_SRC,
  argumentsOf,
  literalsIn,
  propertyValue,
  sourcesUnder,
  splitTopLevel,
  stripComments
} from './backend-source';

/**
 * Инвентарь кодов ошибок, которые бэкенд отдаёт человеку, — статическим разбором исходников.
 *
 * Бэкенд бросает HTTP-исключение с телом `{ code, message }` (правило CLAUDE.md, сторож
 * `apps/backend/src/common/filters/error-code-declared.guard.test.ts` со §5.421 не пускает
 * бросок без кода). Фронт превращает код в две фразы — «что произошло» и «что делать» —
 * словарём `lib/errors/error-text.ts`. Чтобы сторож мог спросить «каждому ли коду словарь
 * отвечает по существу», нужен полный список кодов вместе со статусом: от статуса зависит,
 * какой запасной текст получит код без своей статьи.
 *
 * Считаются только HTTP-исключения. Коды построчных отказов массового ввоза
 * (`duplicate_in_file`, `learner_snils_invalid`, …) сюда НЕ попадают: они показываются в
 * таблице разбора файла со своей причиной в строке, а не через словарь ошибок.
 */

/** Код ошибки: `snake_case`, как в словаре и в `BackendHttpErrorCodes`. */
const CODE = /^[a-z][a-z0-9_]*$/;

/** Исключения Nest → статус ответа. Статус решает, какой запасной текст получит код. */
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
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

const THROW = /throw new ([A-Za-z]\w*(?:Exception|Error))\s*\(/g;

/**
 * Свои классы поверх исключений Nest: `class TenantStateConflictError extends
 * ConflictException`.
 *
 * Ревизия 2026-09-07. До неё инвентарь искал только `throw new *Exception(` — и шесть кодов,
 * которые бэкенд отдаёт через свои классы, были ему НЕВИДИМЫ: сторож молчал о них не потому,
 * что решение принято, а потому, что он их не видел. Четыре из шести получали текст по
 * статусу, и текст врал.
 */
const SUBCLASS = /class\s+(\w+)\s+extends\s+([A-Za-z]\w*Exception)\b/g;

export type ErrorCodeInventory = {
  /** Код → статусы, с которыми он бросается, и места броска. */
  codes: Map<string, { statuses: Set<number>; places: string[] }>;
  /** Броски, где статус вывести не удалось, — с местом. */
  unresolvedStatus: Array<{ location: string; exception: string }>;
  /** Сколько бросков разобрано (страховка от немого сторожа). */
  throws: number;
};

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
  return declaration ? literalsIn(declaration[1]!, CODE) : [];
};

/** Имя своего класса → исключение-родитель, код из конструктора и признак «код доводом». */
const httpSubclasses = (
  files: string[]
): Record<string, { parent: string; code?: string; codeFromArgument?: boolean }> => {
  const found: Record<string, { parent: string; code?: string; codeFromArgument?: boolean }> = {};
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(SUBCLASS)) {
      const body = source.slice(match.index, match.index + 900);
      const code = /super\(\{[\s\S]*?code:\s*'([a-z][a-z0-9_]*)'/.exec(body);
      const fromArgument = /constructor\s*\(\s*(?:readonly\s+)?code\b/.test(body);
      found[match[1]!] = {
        parent: match[2]!,
        ...(code ? { code: code[1]! } : {}),
        ...(fromArgument ? { codeFromArgument: true } : {})
      };
    }
  }
  return found;
};

export const errorCodeInventory = (root: string = BACKEND_SRC): ErrorCodeInventory => {
  if (!existsSync(root)) throw new Error(`не найден каталог бэкенда: ${root}`);
  const codes: ErrorCodeInventory['codes'] = new Map();
  const unresolvedStatus: ErrorCodeInventory['unresolvedStatus'] = [];
  let throws = 0;
  const files = sourcesUnder(root);
  const subclasses = httpSubclasses(files);

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const relativeFile = relative(root, file).split('\\').join('/');

    for (const match of source.matchAll(THROW)) {
      const exception = match[1]!;
      const subclass = subclasses[exception];
      // `*Error` без родителя-исключения человеку конвертом не уходит — её ловят выше.
      if (!STATUS_BY_EXCEPTION[exception] && !subclass) continue;
      const line = source.slice(0, match.index).split('\n').length;
      const location = `${relativeFile}:${line}`;
      const parts = splitTopLevel(argumentsOf(source, match.index + match[0].length - 1).text);
      const first = parts[0] ?? '';

      let found: string[];
      if (subclass) {
        throws += 1;
        found = subclass.codeFromArgument
          ? literalsIn(first, CODE)
          : subclass.code
            ? [subclass.code]
            : [];
        if (!found.length) continue;
      } else {
        if (!first.startsWith('{')) continue;
        throws += 1;
        const rawCode = propertyValue(first, 'code');
        if (rawCode === null) continue;
        found = literalsIn(rawCode, CODE);
        if (!found.length && /^[A-Za-z_$][\w$]*$/.test(rawCode)) {
          found = codesFromLocalConst(source, rawCode);
        }
        if (!found.length) continue;
      }

      const kind = STATUS_BY_EXCEPTION[exception] ? exception : (subclass?.parent ?? exception);
      const status = STATUS_BY_EXCEPTION[kind] ?? statusFromArgument(parts[1]);
      if (status === null) {
        unresolvedStatus.push({ location, exception });
        continue;
      }
      for (const code of found) {
        const entry = codes.get(code) ?? { statuses: new Set<number>(), places: [] };
        entry.statuses.add(status);
        entry.places.push(location);
        codes.set(code, entry);
      }
    }
  }

  return { codes, unresolvedStatus, throws };
};
