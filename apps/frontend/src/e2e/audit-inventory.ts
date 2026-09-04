import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { APP_ROOT } from './app-root';

/**
 * Инвентарь записей журнала действий — статическим разбором исходников бэкенда.
 *
 * Бэкенд пишет в `audit.audit_log` код действия (`learning.learner_created`) и код типа
 * объекта (`learning.group`); фронт показывает их человеку через словарь
 * `features/audit/labels.ts`. Чтобы сторож мог спросить «каждый ли код, который бэкенд
 * ПИШЕТ, словарь умеет ПОКАЗАТЬ», нужен полный список кодов — он собирается здесь.
 *
 * Разбираются все вызовы, чьё имя говорит об аудите: `this.audit(…)`,
 * `auditService.write(…)` / `writeCritical(…)`, `audit.write(…)` и обёртки вида
 * `writeTaskAudit(…)` / `writeAudit(…)` / `auditDecision(…)`. Код берётся:
 *  - из свойства `action:` объектной формы — литерал, тернарник литералов или переменная,
 *    объявленная в том же файле (`const auditAction = cond ? 'auth.esia_login' : 'auth.login'`);
 *  - из ПЕРВОГО литерального аргумента позиционной формы (`this.audit(tenantId, actorId,
 *    'learning.group_created', 'learning.group', …)` — действие идёт раньше типа объекта);
 *  - внутри обёртки, где дальше передаётся её же параметр `action`, кода нет — это не запись,
 *    а проброс; такие вызовы считаются обёрткой и не попадают в «неразобранные».
 * Вызов, у которого код не нашёлся, возвращается в `unresolved` — сторож роняет тест на нём,
 * а не молчит: новая форма записи должна быть либо разобрана, либо названа исключением.
 *
 * Пути — от файла (см. `app-root.ts`), бэкенд читается с диска без сборки.
 */

/** `apps/backend/src` — относительно `apps/frontend`. */
export const BACKEND_SRC = join(APP_ROOT, '..', 'backend', 'src');

export type AuditInventory = {
  /** Код действия → места записи (`modules/mvp/mvp.service.ts:1642`). */
  actions: Map<string, string[]>;
  /** Код типа объекта → места записи. */
  entityTypes: Map<string, string[]>;
  /** Вызовы аудита, где код не нашёлся, — с местом и вызванным именем. */
  unresolved: Array<{ location: string; callee: string }>;
  /** Сколько вызовов аудита разобрано (страховка от немого сторожа). */
  calls: number;
};

/** Код действия: `раздел.объект_действие`, бывает и с тремя частями (`documents.task.retried`). */
const CODE = /^[a-z]+(?:\.[a-z_]+)+$/;
/** Код типа объекта: с префиксом раздела (`learning.group`) или без (`tenant`, `document_task`). */
const ENTITY = /^[a-z_]+(?:\.[a-z_]+)*$/;
/** Вызов с именем про аудит: последний сегмент — `audit`, `write…` или `record…`. */
const AUDIT_CALL = /\b((?:this\.)?(?:[A-Za-z_$][\w$]*\.)*(?:audit\w*|write\w*|record\w*))\s*\(/g;
const DEFINITION_BEFORE = /(?:private|public|protected|async|function|static)\s+$/;

const sourcesUnder = (dir: string): string[] => {
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

/** Снимает комментарии, не трогая строки (в строках бывают `//` — адреса). */
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
const maskStrings = (source: string): string => {
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

/** Текст аргументов вызова, чья открывающая скобка стоит в `open`, и индекс закрывающей. */
const argumentsOf = (source: string, open: number): { text: string; close: number } => {
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

const codesIn = (expression: string, shape: RegExp = CODE): string[] =>
  [...expression.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((code) => shape.test(code));

/**
 * Значение свойства объектного литерала — до запятой верхнего уровня. Сокращённая запись
 * `{ action, … }` возвращает имя свойства — это проброс одноимённого параметра обёртки.
 */
const propertyValue = (objectText: string, name: string): string | null => {
  const match = new RegExp(`(?:^|[{,\\s])${name}\\s*(:|,|\\n|})`).exec(objectText);
  if (!match) return null;
  if (match[1] !== ':') return name;
  const rest = objectText.slice(match.index + match[0].length);
  const [value] = splitTopLevel(rest);
  return (value ?? '').replace(/\}\s*$/, '').trim();
};

const resolveIdentifier = (source: string, name: string): string[] => {
  const declaration = new RegExp(`const\\s+${name}\\s*=([\\s\\S]*?);`).exec(source);
  return declaration ? codesIn(declaration[1]!) : [];
};

export const auditInventory = (root: string = BACKEND_SRC): AuditInventory => {
  if (!existsSync(root)) throw new Error(`не найден каталог бэкенда: ${root}`);
  const actions = new Map<string, string[]>();
  const entityTypes = new Map<string, string[]>();
  const unresolved: AuditInventory['unresolved'] = [];
  let calls = 0;

  const remember = (map: Map<string, string[]>, code: string, location: string) => {
    map.set(code, [...(map.get(code) ?? []), location]);
  };

  for (const file of sourcesUnder(root)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const masked = maskStrings(source);
    const relativeFile = relative(root, file).split('\\').join('/');

    for (const match of masked.matchAll(AUDIT_CALL)) {
      const callee = match[1]!;
      if (!/audit/i.test(callee)) continue;
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (DEFINITION_BEFORE.test(before)) continue;
      const open = match.index + match[0].length - 1;
      const { text, close } = argumentsOf(source, open);
      // За скобками определения идёт тип возврата или тело; за вызовом — нет.
      if (/^\s*[:{]/.test(source.slice(close + 1, close + 6))) continue;

      calls += 1;
      const line = source.slice(0, match.index).split('\n').length;
      const location = `${relativeFile}:${line}`;
      const parts = splitTopLevel(text);
      let found: string[] = [];
      let entity: string[] = [];
      let passthrough = false;

      // Объектная форма — запись целиком первым аргументом: `write({ action, entityType, … })`.
      const objectArgument = parts[0]?.startsWith('{') ? parts[0] : undefined;
      if (objectArgument) {
        const action = propertyValue(objectArgument, 'action');
        if (action !== null) {
          found = codesIn(action);
          if (!found.length && /^[A-Za-z_$][\w$]*$/.test(action)) {
            found = action === 'action' ? [] : resolveIdentifier(source, action);
            passthrough = action === 'action';
          }
        }
        const entityType = propertyValue(objectArgument, 'entityType');
        if (entityType !== null && entityType !== 'entityType') {
          entity = codesIn(entityType, ENTITY);
        }
      }
      if (!found.length && !passthrough && !objectArgument) {
        // Позиционная форма: действие — первый литерал-код, тип объекта — следующий аргумент.
        const at = parts.findIndex((part) => codesIn(part).length > 0);
        if (at !== -1) {
          found = codesIn(parts[at]!);
          entity = codesIn(parts[at + 1] ?? '', ENTITY);
        }
      }

      if (!found.length && !passthrough) unresolved.push({ location, callee });
      for (const code of found) remember(actions, code, location);
      for (const code of entity) remember(entityTypes, code, location);
    }
  }

  return { actions, entityTypes, unresolved, calls };
};
