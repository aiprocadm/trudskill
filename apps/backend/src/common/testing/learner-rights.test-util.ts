import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Права роли `learner` — из миграций, со сверкой по снимку живой базы.
 *
 * Сторожа семейства «объявлено — кто это исполняет» спрашивают «до чего дотягивается
 * слушатель»: до ручки бэкенда (`learner-reaches-registry`), до экрана и пункта меню
 * (`learner-reaches-staff-screen`). Ответ один и тот же: набор кодов, которые миграции выдают
 * роли `learner`. Разбор живёт здесь, чтобы у каждого сторожа не было своей копии —
 * и чтобы новая выдача слушателю проходила ВСЕ сторожа сразу, а не тот, чей парсер
 * её заметил.
 *
 * Ничего не импортирует из приложения: миграции читаются с диска.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `apps/backend/migrations` */
export const MIGRATIONS = resolve(HERE, '../../../migrations');

/**
 * Снимок `iam.role_permissions` живой базы для роли `learner` (2026-09-04, 18 прав).
 * Расходится с миграциями — падает тест «набор прав слушателя читается из миграций»
 * у каждого сторожа, который снимком пользуется.
 */
export const LEARNER_RIGHTS_SNAPSHOT: ReadonlySet<string> = new Set([
  'assessment.assignments.read',
  'assessment.attempts.read',
  'assessment.attempts.take',
  'assessment.results.read',
  'assessment.submissions.submit',
  'assessment.tests.read',
  'courses.read',
  'enrollments.read',
  'esign.participants.sign',
  'identity.submit',
  'materials.read',
  'payments.self_purchase',
  'proctoring.submit',
  'progress.read',
  'progress.recalculate',
  'tenant.read',
  'video.read',
  'webinars.attend'
]);

/** Выдачи `iam.role_permissions` из миграции — по одной на оператор `INSERT … ;`. */
export const grantStatements = (sql: string): string[] => {
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  return [...withoutComments.matchAll(/insert\s+into\s+iam\.role_permissions[\s\S]*?;/gi)].map(
    (m) => m[0]
  );
};

const codesIn = (text: string): string[] =>
  [...text.matchAll(/p\.code\s*(?:=\s*'([a-z_.]+)'|in\s*\(([^)]*)\))/gi)].flatMap((m) =>
    m[1] ? [m[1]] : [...(m[2] ?? '').matchAll(/'([a-z_.]+)'/g)].map((c) => c[1]!)
  );

/**
 * Какие коды оператор выдаёт слушателю. Если условие про `'learner'` стоит в одной строке
 * с `p.code` — берём коды этой строки (`OR (r.code = 'learner' AND p.code = 'x')`); иначе
 * оператор целиком про слушателя (0038: `r.code = 'learner' AND p.code IN (…)`; 0085:
 * `JOIN … p.code = 'x' WHERE r.code IN (…, 'learner')`) — берём все его коды.
 */
export const learnerCodesIn = (statement: string): string[] => {
  if (!/r\.code[\s\S]*?'learner'|'learner'[\s\S]*?r\.code/.test(statement)) return [];
  const lines = statement.split('\n').filter((line) => line.includes("'learner'"));
  const inline = lines.filter((line) => /p\.code/.test(line)).flatMap(codesIn);
  return inline.length > 0 ? inline : codesIn(statement);
};

/** Все выдачи слушателю по миграциям — в порядке номеров файлов. */
export const learnerGrantsByMigration = (): Array<{ migration: string; codes: string[] }> => {
  const out: Array<{ migration: string; codes: string[] }> = [];
  for (const entry of readdirSync(MIGRATIONS).sort()) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(resolve(MIGRATIONS, entry), 'utf8');
    for (const statement of grantStatements(sql)) {
      if (!statement.includes("'learner'")) continue;
      out.push({ migration: entry, codes: learnerCodesIn(statement) });
    }
  }
  return out;
};

/**
 * Достижимо правами слушателя: все объявленные права входят в снимок. Без прав вовсе —
 * достижимо любым вошедшим, слушателем в том числе.
 */
export const reachableByLearner = (permissions: readonly string[]): boolean =>
  permissions.every((code) => LEARNER_RIGHTS_SNAPSHOT.has(code));
