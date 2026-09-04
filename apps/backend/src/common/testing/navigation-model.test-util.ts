import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Карта навигации фронта и чертежи меню ролей — статическим разбором с диска.
 *
 * Сторожа семейства «объявлено — кто это исполняет» читают, что фронт объявляет об экранах
 * и меню: право каждого экрана и пункта (`features/navigation/model.ts`) и состав короткого
 * меню каждой роли (`features/navigation/role-blueprints.ts`). Разбор живёт здесь, чтобы у
 * каждого сторожа не было своей копии с собственными ошибками. Незнакомую форму записи
 * сторожа ловят счётом: разобранных записей столько же, сколько `pattern:` / `href:` /
 * `role:` в файле (`arrayBody` для этого и экспортируется).
 *
 * Ничего не импортирует из фронта: файлы читаются регулярным выражением, без сборки.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const NAVIGATION_DIR = resolve(HERE, '../../../../frontend/src/features/navigation');
export const NAVIGATION_MODEL = resolve(NAVIGATION_DIR, 'model.ts');
export const ROLE_BLUEPRINTS = resolve(NAVIGATION_DIR, 'role-blueprints.ts');

export type Screen = { kind: 'экран' | 'пункт меню'; path: string; permissions: string[] };
export type Blueprint = { role: string; primaryNav: string[] };

/** Комментарии из TypeScript — до разбора: в них тоже встречаются `pattern:` и `href:`. */
export const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Тело массива `export const <name>… = [ … ];` (закрывающая скобка — с начала строки). */
export const arrayBody = (source: string, name: string): string => {
  const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`).exec(source);
  if (!match) throw new Error(`не найден массив ${name}`);
  return match[1]!;
};

const readSource = (file: string): string => {
  if (!existsSync(file)) throw new Error(`не найден файл фронта: ${file}`);
  return stripComments(readFileSync(file, 'utf8'));
};

const codesIn = (list: string | undefined): string[] =>
  [...(list ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);

const ROUTE_ENTRY = /\{\s*pattern:\s*'([^']+)'\s*,\s*meta:\s*\{([^}]*)\}\s*\}/g;
const NAV_ENTRY = /\{([^{}]*)\}/g;

/** Непубличные экраны (`routeMeta`) и пункты меню (`navigationModel`) с их правами. */
export const readNavigationModel = (): { routes: Screen[]; nav: Screen[]; source: string } => {
  const source = readSource(NAVIGATION_MODEL);

  const routes: Screen[] = [];
  for (const m of arrayBody(source, 'routeMeta').matchAll(ROUTE_ENTRY)) {
    const meta = m[2]!;
    if (/public:\s*true/.test(meta)) continue;
    routes.push({
      kind: 'экран',
      path: m[1]!,
      permissions: codesIn(/requiredPermissions:\s*\[([^\]]*)\]/.exec(meta)?.[1])
    });
  }

  const nav: Screen[] = [];
  for (const m of arrayBody(source, 'navigationModel').matchAll(NAV_ENTRY)) {
    const entry = m[1]!;
    const href = /href:\s*'([^']+)'/.exec(entry)?.[1];
    if (!href) continue;
    nav.push({
      kind: 'пункт меню',
      path: href,
      permissions: codesIn(/requiredPermissions:\s*\[([^\]]*)\]/.exec(entry)?.[1])
    });
  }
  return { routes, nav, source };
};

const BLUEPRINT_ENTRY = /role:\s*'([a-z_]+)'[\s\S]*?primaryNav:\s*\[([^\]]*)\]/g;

/** Короткое меню каждой роли (`roleBlueprints[].primaryNav`) — в порядке объявления. */
export const readRoleBlueprints = (): { blueprints: Blueprint[]; source: string } => {
  const source = readSource(ROLE_BLUEPRINTS);
  const blueprints: Blueprint[] = [];
  for (const m of arrayBody(source, 'roleBlueprints').matchAll(BLUEPRINT_ENTRY)) {
    blueprints.push({ role: m[1]!, primaryNav: codesIn(m[2]) });
  }
  return { blueprints, source };
};
