import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Тринадцатый сторож семейства «объявлено — кто это исполняет»: **изменяющая ручка не
 * закрыта одним лишь правом «смотреть».**
 *
 * Права в проекте — глагольные: `*.read` даётся тому, кто смотрит, `*.write` / `*.review` /
 * `*.submit` — тому, кто меняет. Сиды прямо так и объясняют раздачу: «менеджер — только
 * смотрит» (0085), у слушателя и преподавателя из результатов — только `assessment.results.read`
 * (0038, 0084). Но декоратор на ручке ставится руками, и `POST` под правом «читать» —
 * это дверь, которую сид считает закрытой, а код держит открытой. Так и жили две ручки
 * (журнал 340):
 *  - `POST /esign/applications/:id/reuse-check` под `esign.applications.read` переводила
 *    одобренную заявку в `reused` и писала запись в юридический журнал — менеджер «только
 *    смотрел» с правом менять состояние заявки на подпись;
 *  - `POST /exam-results/recalculate` под `assessment.results.read` пересобирала результаты
 *    экзаменов ВСЕГО центра без записи в аудит — и любой слушатель мог её дёрнуть.
 *
 * Инвариант: у обработчика `POST | PUT | PATCH | DELETE` среди объявленных прав есть хотя бы
 * одно не «читающее». «Читающим» считается право, чей глагол (последний сегмент кода) — из
 * `READ_WORDS`. Мутации без прав вовсе — забота соседа (`permission-surface`), здесь они
 * не рассматриваются.
 *
 * Исключения — `EXEMPT`, поимённо и с причиной: это `POST`, которые по сути читают (тело
 * запроса — описание того, что показать), и объявленное в миграции решение. Мёртвая запись
 * (ничего не совпало) роняет тест.
 *
 * Проверено подсадным нарушителем: `POST` с одним лишь `*.read` роняет тест и называет
 * маршрут с правом.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

/** Сегменты кода права, которые означают «смотреть», а не «менять». */
const READ_WORDS = new Set(['read', 'view', 'list', 'export', 'download']);

/** Изменяющие по глаголу HTTP ручки, которые по сути читают, — с причиной. */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: 'POST /reports/builder/preview',
    why: 'конструктор отчётов: тело — описание отчёта, ответ — первые строки; ничего не сохраняется'
  },
  {
    route: 'POST /reports/builder/export',
    why: 'то же описание отчёта, ответ — xlsx прямо в теле ответа, не в хранилище'
  },
  {
    route: 'POST /video-materials/:materialId/playback',
    why: 'подписанная ссылка на видео: тело — enrollmentId, ничего не сохраняется'
  },
  {
    route: 'POST /scorm-materials/:materialId/launch',
    why: '0052 объявляет «launch = materials.read»: сеанс заводится СВОЕМУ слушателю (assertActorMatchesLearnerIamLink), прогресс пишет commit под progress.recalculate'
  }
];

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
const REQUIRE_PERMISSIONS = /@RequirePermissions\(([^)]*)\)/g;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const joinRoute = (prefix: string, path: string): string =>
  '/' + [prefix, path].filter(Boolean).join('/').replace(/^\/+/, '').replace(/\/+/g, '/');

type Handler = {
  file: string;
  line: number;
  route: string;
  className: string;
  method: string;
  /** Все коды из `@RequirePermissions` на обработчике и на классе. */
  permissions: string[];
};

const permissionsIn = (cluster: string): string[] =>
  [...cluster.matchAll(REQUIRE_PERMISSIONS)].flatMap((m) =>
    [...m[1]!.matchAll(/'([^']+)'/g)].map((code) => code[1]!)
  );

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
        permissions: [...permissionsIn(cluster), ...permissionsIn(classCluster)]
      });
    }
  }
  return out;
};

/**
 * Глагол права — последний сегмент (`regulatory.export.write` — «писать», хотя в середине
 * стоит «export»). Единственное уточнение после глагола — `assessment.read.cross_learner`:
 * там глагол предпоследний.
 */
const isReadLike = (code: string): boolean => {
  const segments = code.split('.');
  return READ_WORDS.has(segments.at(-1)!) || segments.at(-2) === 'read';
};

/** Мутации, у которых объявлено хотя бы одно право. */
const guardedMutations = (): Handler[] =>
  handlers().filter((h) => MUTATING.has(h.route.split(' ')[0]!) && h.permissions.length > 0);

const isExempt = (h: Handler): boolean => EXEMPT.some((e) => h.route === e.route);

const mutationsUnderReadOnly = (): string[] =>
  guardedMutations()
    .filter((h) => !isExempt(h))
    .filter((h) => h.permissions.every(isReadLike))
    .map(
      (h) =>
        `${h.route} [${h.permissions.join(', ')}] — ${h.file}:${h.line} ${h.className}.${h.method}`
    )
    .sort();

describe('изменяющая ручка не закрыта одним лишь правом «смотреть»', () => {
  it('у каждой мутации среди прав есть не читающее', () => {
    expect(
      mutationsUnderReadOnly(),
      'Эти ручки меняют данные, а пускают по праву, которое сиды выдают тем, кто «только ' +
        'смотрит» (менеджер, преподаватель, слушатель). Поставьте право того, кто ведёт эти ' +
        'данные (`*.write`, `*.review`, `*.submit`, …) по образцу соседних ручек контроллера. ' +
        'Если ручка на самом деле читает (тело — описание того, что показать) — впишите её в ' +
        '`EXEMPT` с причиной, а не снимайте проверку. Так жили reuse-check заявки на подпись ' +
        'и пересчёт результатов экзаменов (журнал 340).'
    ).toEqual([]);
  });

  it('каждое исключение из EXEMPT ещё существует — мёртвых записей нет', () => {
    const routes = guardedMutations().map((h) => h.route);
    for (const { route } of EXEMPT) {
      expect(
        routes.includes(route),
        `${route} в EXEMPT, но такой мутации с правом больше нет — уберите запись`
      ).toBe(true);
    }
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор прав сломается, мутаций «под правом» не
    // станет и проверка выше позеленеет ни на чём. Их в бэкенде больше двухсот.
    expect(guardedMutations().length).toBeGreaterThanOrEqual(200);
    expect(handlers().length).toBeGreaterThanOrEqual(100);
  });
});
