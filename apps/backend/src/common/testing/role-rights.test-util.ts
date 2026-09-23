import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Права ролей — из миграций, со сверкой по снимку живой базы.
 *
 * Сторожа семейства «объявлено — кто это исполняет» спрашивают «до чего дотягивается
 * роль»: слушатель — до ручки бэкенда (`learner-reaches-registry`), до экрана и пункта меню
 * (`learner-reaches-staff-screen`); любая роль — до пунктов своего короткого меню
 * (`role-menu-reachable`). Ответ один и тот же: набор кодов, которые миграции выдают роли.
 * Разбор живёт здесь, чтобы у каждого сторожа не было своей копии — и чтобы новая выдача
 * роли проходила ВСЕ сторожа сразу, а не тот, чей парсер её заметил.
 *
 * Ничего не импортирует из приложения: миграции читаются с диска.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `apps/backend/migrations` */
export const MIGRATIONS = resolve(HERE, '../../../migrations');

export type RoleCode =
  | 'platform_admin'
  | 'tenant_admin'
  | 'manager'
  | 'methodist'
  | 'teacher'
  | 'learner'
  | 'counterparty_rep';

/**
 * Роли, каждая выдача которым в миграциях — явный перечень кодов: набор целиком выводится
 * из миграций и обязан СОВПАДАТЬ со снимком. Администраторам 0010 выдаёт «все права на тот
 * момент» без перечня, поэтому из миграций для них выводится только часть — сверяется
 * как подмножество снимка.
 */
export const EXPLICIT_GRANT_ROLES: readonly RoleCode[] = [
  'manager',
  'methodist',
  'teacher',
  'learner',
  'counterparty_rep'
];

/**
 * Снимок `iam.role_permissions` живой базы (2026-09-04) плюс выдача 0091 (`workspace.read`
 * пяти ролям центра), которая на момент снимка ещё не была накачена. Расходится с
 * миграциями — падает тест «набор прав роли читается из миграций» у каждого сторожа,
 * который снимком пользуется.
 */
export const ROLE_RIGHTS_SNAPSHOT: Readonly<Record<RoleCode, ReadonlySet<string>>> = {
  platform_admin: new Set([
    'assessment.assignments.read',
    'assessment.assignments.write',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.question_banks.read',
    'assessment.question_banks.write',
    'assessment.questions.read',
    'assessment.questions.write',
    'assessment.read.cross_learner',
    'assessment.results.read',
    'assessment.reviews.review',
    'assessment.submissions.submit',
    'assessment.tests.publish',
    'assessment.tests.read',
    'assessment.tests.write',
    'auth.manage_sessions',
    'consent.configure',
    'counterparties.read',
    'counterparties.write',
    'courses.archive',
    'courses.publish',
    'courses.read',
    'courses.write',
    'directions.read',
    'directions.write',
    'documents.generate',
    'documents.read',
    'documents.sign',
    'documents.write',
    'enrollments.change_status',
    'enrollments.read',
    'enrollments.write',
    'esign.applications.read',
    'esign.applications.review',
    'esign.applications.submit',
    'esign.applications.write',
    'esign.legal.read',
    'esign.participants.sign',
    'esign.processes.read',
    'esign.processes.write',
    'esignature.configure',
    'groups.read',
    'groups.write',
    'iam.manage_roles',
    'identity.configure',
    'identity.read',
    'identity.review',
    'identity.submit',
    'integrations.read',
    'integrations.write',
    'learners.act_as',
    'learners.pii.manage',
    'learners.read',
    'learners.write',
    'learning.commissions.read',
    'learning.commissions.write',
    'learning.course_document_sets.read',
    'learning.course_document_sets.write',
    'learning.courses.publish',
    'library.publish',
    'materials.read',
    'materials.write',
    'notifications.read',
    'notifications.write',
    'operations.quarantine.read',
    'operations.quarantine.write',
    'org.licenses.read',
    'org.licenses.write',
    'payments.configure',
    'payments.read',
    'payments.write',
    'platform.impersonate',
    'platform.integrations.write',
    'platform.tenants.read',
    'platform.tenants.write',
    'portal.read',
    'proctoring.read',
    'proctoring.submit',
    'progress.read',
    'progress.recalculate',
    'recertification.read',
    'recertification.write',
    'regulatory.export.read',
    'regulatory.export.write',
    'sms.configure',
    'tenant.branding.configure',
    'tasks.manage_all',
    'tasks.read',
    'tasks.write',
    'tenant.read',
    'tenant.settings.write',
    'tenant.usage.read',
    'video.configure',
    'video.read',
    'video.write',
    'webinars.configure',
    'webinars.read',
    'webinars.write',
    'workspace.read'
  ]),
  tenant_admin: new Set([
    'assessment.assignments.read',
    'assessment.assignments.write',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.question_banks.read',
    'assessment.question_banks.write',
    'assessment.questions.read',
    'assessment.questions.write',
    'assessment.read.cross_learner',
    'assessment.results.read',
    'assessment.reviews.review',
    'assessment.submissions.submit',
    'assessment.tests.publish',
    'assessment.tests.read',
    'assessment.tests.write',
    'auth.manage_sessions',
    'consent.configure',
    'counterparties.read',
    'counterparties.write',
    'courses.archive',
    'courses.publish',
    'courses.read',
    'courses.write',
    'directions.read',
    'directions.write',
    'documents.generate',
    'documents.read',
    'documents.sign',
    'documents.write',
    'enrollments.change_status',
    'enrollments.read',
    'enrollments.write',
    'esign.applications.read',
    'esign.applications.review',
    'esign.applications.submit',
    'esign.applications.write',
    'esign.legal.read',
    'esign.participants.sign',
    'esign.processes.read',
    'esign.processes.write',
    'esignature.configure',
    'groups.read',
    'groups.write',
    'iam.manage_roles',
    'identity.configure',
    'identity.read',
    'identity.review',
    'identity.submit',
    'integrations.read',
    'integrations.write',
    'learners.act_as',
    'learners.pii.manage',
    'learners.read',
    'learners.write',
    'learning.commissions.read',
    'learning.commissions.write',
    'learning.course_document_sets.read',
    'learning.course_document_sets.write',
    'learning.courses.publish',
    'materials.read',
    'materials.write',
    'notifications.read',
    'notifications.write',
    'operations.quarantine.read',
    'operations.quarantine.write',
    'org.licenses.read',
    'org.licenses.write',
    'payments.configure',
    'payments.read',
    'payments.write',
    'portal.read',
    'proctoring.read',
    'proctoring.submit',
    'progress.read',
    'progress.recalculate',
    'recertification.read',
    'recertification.write',
    'regulatory.export.read',
    'regulatory.export.write',
    'sms.configure',
    'tenant.branding.configure',
    'tasks.manage_all',
    'tasks.read',
    'tasks.write',
    'tenant.read',
    'tenant.settings.write',
    'tenant.usage.read',
    'video.configure',
    'video.read',
    'video.write',
    'webinars.configure',
    'webinars.read',
    'webinars.write',
    'workspace.read'
  ]),
  manager: new Set([
    'assessment.assignments.read',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.question_banks.read',
    'assessment.questions.read',
    'assessment.read.cross_learner',
    'assessment.results.read',
    'assessment.reviews.review',
    'assessment.submissions.submit',
    'assessment.tests.read',
    'counterparties.read',
    'counterparties.write',
    'courses.read',
    'directions.read',
    'documents.read',
    'enrollments.change_status',
    'enrollments.read',
    'enrollments.write',
    'esign.applications.read',
    'esign.processes.read',
    'groups.read',
    'groups.write',
    'learners.act_as',
    'learners.read',
    'learners.write',
    'learning.commissions.read',
    'learning.course_document_sets.read',
    'materials.read',
    'portal.read',
    'progress.read',
    'regulatory.export.read',
    'tasks.manage_all',
    'tasks.read',
    'tasks.write',
    'tenant.read',
    'workspace.read'
  ]),
  methodist: new Set([
    'assessment.assignments.read',
    'assessment.assignments.write',
    'assessment.attempts.read',
    'assessment.question_banks.read',
    'assessment.question_banks.write',
    'assessment.questions.read',
    'assessment.questions.write',
    'assessment.read.cross_learner',
    'assessment.results.read',
    'assessment.reviews.review',
    'assessment.tests.publish',
    'assessment.tests.read',
    'assessment.tests.write',
    'courses.archive',
    'courses.publish',
    'courses.read',
    'courses.write',
    'directions.read',
    'directions.write',
    'documents.generate',
    'documents.read',
    'documents.sign',
    'documents.write',
    'esign.applications.read',
    'esign.applications.submit',
    'esign.applications.write',
    'esign.participants.sign',
    'esign.processes.read',
    'esign.processes.write',
    'identity.read',
    'identity.review',
    'learners.act_as',
    'learning.commissions.read',
    'learning.course_document_sets.read',
    'learning.course_document_sets.write',
    'learning.courses.publish',
    'materials.read',
    'materials.write',
    'notifications.read',
    'org.licenses.read',
    'proctoring.read',
    'progress.read',
    'progress.recalculate',
    'recertification.read',
    'regulatory.export.read',
    'tasks.read',
    'tasks.write',
    'tenant.read',
    'video.read',
    'video.write',
    'webinars.read',
    'webinars.write',
    'workspace.read'
  ]),
  teacher: new Set([
    'assessment.assignments.read',
    'assessment.attempts.read',
    'assessment.results.read',
    'assessment.reviews.review',
    'assessment.submissions.submit',
    'assessment.tests.read',
    'courses.read',
    'enrollments.read',
    'esign.participants.sign',
    'groups.read',
    'learners.read',
    'materials.read',
    'progress.read',
    'tasks.read',
    'tasks.write',
    'tenant.read',
    'workspace.read'
  ]),
  learner: new Set([
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
  ]),
  counterparty_rep: new Set(['portal.read'])
};

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

const ROLE_CONDITION = /r\.code\s*(?:=\s*'([a-z_]+)'|in\s*\(([^)]*)\))/gi;

/**
 * Ближайшая скобочная группа, в которой стоит условие о роли: `(r.code = 'manager' AND
 * p.code IN (…))` — коды этой группы и есть выдача роли. Условие вне скобок (0038: `WHERE
 * r.code = 'learner' AND p.code IN (…)`; 0084: `WHERE r.code = 'teacher'`) относится ко
 * всему оператору.
 */
const enclosingGroup = (statement: string, at: number): string => {
  let depth = 0;
  let start = -1;
  for (let i = at - 1; i >= 0; i -= 1) {
    const ch = statement[i];
    if (ch === ')') depth += 1;
    else if (ch === '(') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return statement;
  depth = 0;
  for (let i = start; i < statement.length; i += 1) {
    if (statement[i] === '(') depth += 1;
    else if (statement[i] === ')') {
      depth -= 1;
      if (depth === 0) return statement.slice(start, i + 1);
    }
  }
  return statement.slice(start);
};

/**
 * Какие коды оператор выдаёт роли. Для каждого условия `r.code = '<роль>'` / `r.code IN (…,
 * '<роль>', …)` берутся коды `p.code` из его скобочной группы; если в группе про `p.code`
 * ничего нет — из всего оператора (0085: `JOIN … p.code = 'x' WHERE r.code IN (…)`).
 * Пусто — оператор выдаёт роли «всё» без перечня (0010 администраторам) или записан в
 * незнакомой форме; сторожа на это падают отдельным тестом.
 */
export const roleCodesIn = (statement: string, role: RoleCode): string[] => {
  const out: string[] = [];
  for (const m of statement.matchAll(ROLE_CONDITION)) {
    const roles = m[1] ? [m[1]] : [...(m[2] ?? '').matchAll(/'([a-z_]+)'/g)].map((c) => c[1]!);
    if (!roles.includes(role)) continue;
    const group = enclosingGroup(statement, m.index!);
    out.push(...(/p\.code/i.test(group) ? codesIn(group) : codesIn(statement)));
  }
  return out;
};

/** Все выдачи роли по миграциям — в порядке номеров файлов. */
export const roleGrantsByMigration = (
  role: RoleCode
): Array<{ migration: string; codes: string[] }> => {
  const out: Array<{ migration: string; codes: string[] }> = [];
  for (const entry of readdirSync(MIGRATIONS).sort()) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(resolve(MIGRATIONS, entry), 'utf8');
    for (const statement of grantStatements(sql)) {
      if (!statement.includes(`'${role}'`)) continue;
      out.push({ migration: entry, codes: roleCodesIn(statement, role) });
    }
  }
  return out;
};

/**
 * Достижимо правами роли: все объявленные права входят в её снимок. Без прав вовсе —
 * достижимо любым вошедшим, этой ролью в том числе.
 */
export const reachableBy = (role: RoleCode, permissions: readonly string[]): boolean =>
  permissions.every((code) => ROLE_RIGHTS_SNAPSHOT[role].has(code));
