import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Инвентарь HTTP-обработчиков бэкенда — статическим разбором `*.controller.ts`.
 *
 * Сторожа семейства «объявлено — кто это исполняет» задают вопросы вида «какие ручки
 * закрыты каким правом». Ответ один и тот же для всех: маршрут, метод, класс и все коды
 * из `@RequirePermissions` на обработчике и на классе. Разбор живёт здесь, чтобы у
 * каждого сторожа не было своей копии с собственными ошибками (первая версия одного из
 * них засчитывала право соседней ручки текущей — граница декораторов должна быть явной).
 *
 * Ничего не импортирует из приложения: инвентарь читается с диска, без Nest.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `apps/backend/src` */
export const BACKEND_SRC = resolve(HERE, '../..');

export type ControllerHandler = {
  /** Путь файла относительно `apps/backend/src`. */
  file: string;
  /** Строка декоратора маршрута (с единицы). */
  line: number;
  /** `GET /groups/:id/progress-summary` — глагол HTTP и полный путь с префиксом контроллера. */
  route: string;
  className: string;
  method: string;
  /** Все коды из `@RequirePermissions` на обработчике и на классе. */
  permissions: string[];
};

/** Не тестовые `*.controller.ts` под каталогом — рекурсивно. */
export const controllerSources = (dir: string = BACKEND_SRC): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...controllerSources(full));
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Строка — часть декораторной обвязки, а не тела метода: `@…`, комментарий или закрывающая скобка. */
const DECORATOR_LINE = /^\s*(?:@|\/\/|\/?\*|[)}\]]+,?\s*$)/;
/** Сигнатура метода контроллера: `name(` или `async name(`; декораторы сюда не попадают. */
const METHOD_SIGNATURE =
  /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const CLASS_LINE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const ROUTE_DECORATOR = /^\s*@(Get|Post|Put|Patch|Delete|All|Head|Options)\((?:'([^']*)')?\)/;
const CONTROLLER_PREFIX = /@Controller\((?:'([^']*)')?\)/;
const REQUIRE_PERMISSIONS = /@RequirePermissions\(([^)]*)\)/g;

const joinRoute = (prefix: string, path: string): string =>
  '/' + [prefix, path].filter(Boolean).join('/').replace(/^\/+/, '').replace(/\/+/g, '/');

const permissionsIn = (cluster: string): string[] =>
  [...cluster.matchAll(REQUIRE_PERMISSIONS)].flatMap((m) =>
    [...m[1]!.matchAll(/'([^']+)'/g)].map((code) => code[1]!)
  );

/**
 * Право «принадлежит» ручке, если объявлено в ЕЁ цепочке декораторов (от первой
 * строки-декоратора над маршрутом до сигнатуры метода) или в цепочке над классом.
 */
export const controllerHandlers = (root: string = BACKEND_SRC): ControllerHandler[] => {
  const out: ControllerHandler[] = [];
  for (const file of controllerSources(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const route = ROUTE_DECORATOR.exec(lines[index] ?? '');
      if (!route) continue;

      let start = index;
      while (start > 0 && DECORATOR_LINE.test(lines[start - 1] ?? '')) start -= 1;
      let end = index;
      while (end < lines.length - 1 && !METHOD_SIGNATURE.test(lines[end + 1] ?? '')) end += 1;
      const cluster = lines.slice(start, end + 1).join('\n');
      const method = METHOD_SIGNATURE.exec(lines[end + 1] ?? '')?.[1] ?? '<метод не найден>';

      let classLine = start;
      while (classLine > 0 && !CLASS_LINE.test(lines[classLine] ?? '')) classLine -= 1;
      let classStart = classLine;
      while (classStart > 0 && DECORATOR_LINE.test(lines[classStart - 1] ?? '')) classStart -= 1;
      const classCluster = lines.slice(classStart, classLine).join('\n');
      const className = CLASS_LINE.exec(lines[classLine] ?? '')?.[1] ?? '<класс не найден>';
      // Префикс — у СВОЕГО класса: в одном файле бывает несколько контроллеров
      // (`integrations` / `exports` / `sync-logs`), и первый `@Controller` файла — не их.
      const prefix = CONTROLLER_PREFIX.exec(classCluster)?.[1] ?? '';

      out.push({
        file: file.slice(root.length + 1),
        line: index + 1,
        route: `${route[1]!.toUpperCase()} ${joinRoute(prefix, route[2] ?? '')}`,
        className,
        method,
        permissions: [...permissionsIn(cluster), ...permissionsIn(classCluster)]
      });
    }
  }
  return out;
};

/** `GET /groups/:id [groups.read] — mvp/mvp.controller.ts:684 MvpController.getGroup` */
export const describeHandler = (h: ControllerHandler): string =>
  `${h.route} [${h.permissions.join(', ')}] — ${h.file}:${h.line} ${h.className}.${h.method}`;
