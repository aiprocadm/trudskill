import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Двенадцатый сторож семейства «объявлено — кто это исполняет»: **предел частоты у каждой
 * двери, в которую можно войти без входа.**
 *
 * ФТ-G2 обещает предел частоты на «логин, восстановление пароля, ввод exam-кодов,
 * `/verify/{qr}`, публичные формы». Десятый сторож (`throttle-needs-guard`) следит, чтобы
 * ОБЪЯВЛЕННЫЙ предел кто-то применял. Но он молчит там, где предел не объявлен вовсе, — а
 * именно так живут двери без входа, о которых при добавлении никто не вспомнил про ФТ-G2:
 * вход через ЕСИА (`auth/esia/*`, та же дверь входа, что и `auth/login` с его 25/мин) и
 * вебхук видеосервиса (единственный из трёх вебхуков без 60/мин; журнал 339).
 *
 * Инвариант: у каждого обработчика, до которого запрос доходит без bearer-токена, есть
 * `ThrottlerGuard` (на методе или на классе; при нём без `@Throttle` действует общий
 * предел из `ThrottlerModule.forRoot`). «Без bearer-токена» сторож выводит из кода, а не из
 * списка: контроллер вне `TenantGuard` — публичен целиком; под `TenantGuard` публичны только
 * bootstrap-маршруты, которые сам guard пропускает (`endsWith('/auth/…')`, `includes('/auth/esia/')`).
 *
 * Исключения двух видов, оба с причиной:
 *  - ручка закрыта общим секретом (`WorkerCallbackGuard`, `MetricsTokenGuard`) — чужой запрос
 *    отбивается до тела, а свой ходит по расписанию; предел ему не защита, а помеха;
 *  - `EXEMPT` ниже — поимённо и с объяснением. Мёртвая запись (ничего не совпало) роняет тест.
 *
 * Если однажды guard станет глобальным (`APP_GUARD`), сторож увидит это в `app.module.ts` и
 * отойдёт: тогда его требование выполняется само.
 *
 * Проверено подсадным нарушителем: снятие `ThrottlerGuard` с любой публичной ручки роняет
 * тест и называет её маршрутом.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const TENANT_GUARD = resolve(HERE, 'tenant.guard.ts');

/** Публичные ручки, которым предел частоты не нужен, — с причиной. Совпадает по началу маршрута. */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: 'GET /health',
    why: 'liveness/readiness опрашивает оркестратор; предел превратил бы нагрузку в «сервис мёртв»'
  },
  {
    route: 'GET /auth/csrf',
    why: 'возвращает значение уже пришедшей cookie — без базы и побочных эффектов; без cookie сама отвечает 401'
  },
  {
    route: 'GET /scorm-content',
    why: 'раздача SCORM в iframe — десятки файлов на пакет за секунды; дверь закрыта HMAC-токеном в URL'
  }
];

/** Guard, который сам отбивает чужой запрос общим секретом до тела обработчика. */
const SECRET_GUARDS = /@UseGuards\([^)]*\b(?:WorkerCallbackGuard|MetricsTokenGuard)\b[^)]*\)/;

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
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
const HAS_TENANT_GUARD = /@UseGuards\([^)]*\bTenantGuard\b[^)]*\)/;
const HAS_THROTTLER_GUARD = /@UseGuards\([^)]*\bThrottlerGuard\b[^)]*\)/;

/** Глобальный `ThrottlerGuard` через `APP_GUARD` делает по-роутный лишним — тогда сторож молчит. */
const throttlerGuardIsGlobal = (): boolean => {
  const appModule = readFileSync(resolve(BACKEND_SRC, 'app.module.ts'), 'utf8');
  return /APP_GUARD[\s\S]{0,200}?\bThrottlerGuard\b/.test(appModule);
};

/** Что `TenantGuard` пропускает без bearer — читаем из него самого, а не переписываем. */
const bootstrapRules = (): { suffixes: string[]; fragments: string[] } => {
  const text = readFileSync(TENANT_GUARD, 'utf8');
  const suffixes = [...text.matchAll(/requestPath\.endsWith\('([^']+)'\)/g)].map((m) => m[1]!);
  const fragments = [...text.matchAll(/requestPath\.includes\('([^']+)'\)/g)].map((m) => m[1]!);
  if (suffixes.length === 0 && fragments.length === 0) {
    throw new Error('в tenant.guard.ts не найдено ни одного bootstrap-маршрута — сторож ослеп');
  }
  return { suffixes, fragments };
};

const joinRoute = (prefix: string, path: string): string =>
  '/' + [prefix, path].filter(Boolean).join('/').replace(/^\/+/, '').replace(/\/+/g, '/');

type Handler = {
  file: string;
  line: number;
  route: string;
  className: string;
  method: string;
  cluster: string;
  classCluster: string;
};

const handlers = (): Handler[] => {
  const out: Handler[] = [];
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    const prefix = CONTROLLER_PREFIX.exec(text)?.[1] ?? '';
    const lines = text.split('\n');

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

      out.push({
        file: file.slice(BACKEND_SRC.length + 1),
        line: index + 1,
        route: `${route[1]!.toUpperCase()} ${joinRoute(prefix, route[2] ?? '')}`,
        className,
        method,
        cluster,
        classCluster
      });
    }
  }
  return out;
};

/** Обработчики, до которых запрос доходит без bearer-токена. */
const publicHandlers = (): Handler[] => {
  const { suffixes, fragments } = bootstrapRules();
  return handlers().filter((h) => {
    const path = h.route.split(' ')[1]!;
    if (!HAS_TENANT_GUARD.test(h.cluster) && !HAS_TENANT_GUARD.test(h.classCluster)) return true;
    return suffixes.some((s) => path.endsWith(s)) || fragments.some((f) => path.includes(f));
  });
};

const isExempt = (h: Handler): boolean =>
  EXEMPT.some((e) => h.route === e.route || h.route.startsWith(`${e.route}/`)) ||
  SECRET_GUARDS.test(h.cluster) ||
  SECRET_GUARDS.test(h.classCluster);

const unlimitedPublicHandlers = (): string[] =>
  publicHandlers()
    .filter((h) => !isExempt(h))
    .filter(
      (h) => !HAS_THROTTLER_GUARD.test(h.cluster) && !HAS_THROTTLER_GUARD.test(h.classCluster)
    )
    .map((h) => `${h.route} — ${h.file}:${h.line} ${h.className}.${h.method}`)
    .sort();

describe('предел частоты у каждой двери без входа (ФТ-G2)', () => {
  it('у каждой публичной ручки есть ThrottlerGuard на обработчике или на классе', () => {
    if (throttlerGuardIsGlobal()) return;
    expect(
      unlimitedPublicHandlers(),
      'До этих ручек запрос доходит без bearer-токена, а предела частоты у них нет — ФТ-G2 ' +
        'объявлен, но не исполняется. Добавьте `@UseGuards(ThrottlerGuard)` и `@Throttle(...)` ' +
        'по образцу соседей (`auth/login` — 25/мин, вебхуки — 60/мин). Если предел ручке ' +
        'действительно вреден — впишите её в `EXEMPT` с причиной, а не снимайте проверку. ' +
        'Так без предела жили вход через ЕСИА и вебхук видео (журнал 339).'
    ).toEqual([]);
  });

  it('каждое исключение из EXEMPT ещё существует — мёртвых записей нет', () => {
    const routes = publicHandlers().map((h) => h.route);
    for (const { route } of EXEMPT) {
      expect(
        routes.some((r) => r === route || r.startsWith(`${route}/`)),
        `${route} в EXEMPT, но такой публичной ручки больше нет — уберите запись`
      ).toBe(true);
    }
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор сломается, публичных ручек «не станет» и
    // проверка выше позеленеет ни на чём. Одних только bootstrap-маршрутов входа больше пяти.
    expect(publicHandlers().length).toBeGreaterThanOrEqual(10);
    expect(handlers().length).toBeGreaterThanOrEqual(100);
  });
});
