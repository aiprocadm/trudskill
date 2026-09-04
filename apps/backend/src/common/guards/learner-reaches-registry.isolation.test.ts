import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  type ControllerHandler,
  controllerHandlers,
  describeHandler
} from '../testing/controller-inventory.test-util.js';

/**
 * Четырнадцатый сторож семейства «объявлено — кто это исполняет»: **правами слушателя не
 * дотянуться до чужого реестра.**
 *
 * Роль `learner` (0038 и позже) собрана из прав «за себя»: `progress.read` — чтобы видеть
 * СВОЙ прогресс, `enrollments.read` — СВОИ зачисления. Списки под этими правами сервис
 * режет по актору (`restrictLearnerIdsForAssessmentList`), карточки — проверяет владение
 * (`assertAssessmentReadAllowedForLearner`). Но ручка, адрес которой — чужой реестр
 * (`/groups/:groupId/…`, `/learners/:id/…`, `/users/:id/…`), «за себя» не бывает: группа —
 * это список людей, и внутри неё сервису резать нечего. Такую ручку закрывает только
 * право самого реестра (`groups.read`, `learners.read`, `iam.manage_roles`), которого у
 * слушателя нет. Так и жил журнал учебных часов группы (журнал 341): `GET
 * /groups/:groupId/learning-journal` под `progress.read` отдавал слушателю имена, статусы
 * зачисления и часы всех слушателей любой группы центра — по одному лишь идентификатору,
 * который он знает из собственного зачисления.
 *
 * Инвариант: у обработчика с адресом реестра (`REGISTRY_ROUTE`) права не сводятся к
 * набору слушателя. «Сводятся» — все объявленные права входят в `LEARNER_RIGHTS`; ручка
 * без прав вовсе достижима любым вошедшим и тоже считается.
 *
 * Набор прав слушателя читается из миграций (все выдачи `iam.role_permissions`, где
 * роль — `'learner'`) и сверяется со снимком живой базы: новая выдача слушателю обязана
 * появиться в снимке — и тем самым заново пройти этот сторож. Выдача в форме, которую
 * разбор не понимает, роняет отдельный тест, а не молчит.
 *
 * Исключения — `EXEMPT`, поимённо и с причиной. Мёртвая запись роняет тест.
 *
 * Проверено подсадным нарушителем: журнал группы под `progress.read` роняет тест и
 * называет маршрут с правом; снятое из снимка право роняет сверку с миграциями.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(HERE, '../../../migrations');

/**
 * Снимок `iam.role_permissions` живой базы для роли `learner` (2026-09-04, 18 прав).
 * Расходится с миграциями — падает тест «набор прав слушателя читается из миграций».
 */
const LEARNER_RIGHTS_SNAPSHOT: ReadonlySet<string> = new Set([
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

/**
 * Адрес чужого реестра: сегмент-коллекция людей, за которым идёт параметр. `enrollments`,
 * `attempts`, `progress` сюда не входят — это «своё», владение проверяет сервис.
 */
const REGISTRY_ROUTE = /(?:^|\/)(groups|learners|users|counterparties)\/:/;

/** Ручки с адресом реестра, достижимые правами слушателя по праву, — с причиной. */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: 'GET /users/:id/roles',
    why: 'свои роли читает каждый вошедший; чужие — только с iam.manage_roles, проверка в теле обработчика (context.userId !== id)'
  }
];

/** Выдачи `iam.role_permissions` из миграции — по одной на оператор `INSERT … ;`. */
const grantStatements = (sql: string): string[] => {
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
const learnerCodesIn = (statement: string): string[] => {
  if (!/r\.code[\s\S]*?'learner'|'learner'[\s\S]*?r\.code/.test(statement)) return [];
  const lines = statement.split('\n').filter((line) => line.includes("'learner'"));
  const inline = lines.filter((line) => /p\.code/.test(line)).flatMap(codesIn);
  return inline.length > 0 ? inline : codesIn(statement);
};

const learnerGrantsByMigration = (): Array<{ migration: string; codes: string[] }> => {
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

const reachableByLearner = (h: ControllerHandler): boolean =>
  h.permissions.every((code) => LEARNER_RIGHTS_SNAPSHOT.has(code));

const registryHandlers = (): ControllerHandler[] =>
  controllerHandlers().filter((h) => REGISTRY_ROUTE.test(h.route.split(' ')[1]!));

const isExempt = (h: ControllerHandler): boolean => EXEMPT.some((e) => h.route === e.route);

const registryReachableByLearner = (): string[] =>
  registryHandlers()
    .filter((h) => !isExempt(h))
    .filter(reachableByLearner)
    .map(describeHandler)
    .sort();

describe('правами слушателя не дотянуться до чужого реестра', () => {
  it('набор прав слушателя читается из миграций и совпадает со снимком живой базы', () => {
    const fromMigrations = new Set(learnerGrantsByMigration().flatMap((g) => g.codes));
    expect(
      [...fromMigrations].sort(),
      'Миграции выдают слушателю не то, что записано в LEARNER_RIGHTS_SNAPSHOT. Новое право ' +
        'слушателя — впишите в снимок и убедитесь, что тест ниже остался зелёным: каждое ' +
        'новое право слушателя заново открывает ручки, которые под ним стоят.'
    ).toEqual([...LEARNER_RIGHTS_SNAPSHOT].sort());
  });

  it('каждая выдача слушателю в миграциях прочитана — незнакомая форма не молчит', () => {
    for (const { migration, codes } of learnerGrantsByMigration()) {
      expect(
        codes.length,
        `${migration}: оператор INSERT в iam.role_permissions упоминает 'learner', но разбор не ` +
          'нашёл, какие коды он выдаёт. Либо поправьте разбор (learnerCodesIn), либо ' +
          'приведите выдачу к одной из известных форм.'
      ).toBeGreaterThan(0);
    }
  });

  it('ни одна ручка с адресом реестра не достижима правами слушателя', () => {
    expect(
      registryReachableByLearner(),
      'Адрес этих ручек — чужой реестр (группа, слушатель, пользователь, контрагент), а ' +
        'права на них есть у роли learner. Внутри реестра сервису нечего резать «по себе»: ' +
        'слушатель получит чужие имена и данные. Закройте ручку правом самого реестра ' +
        '(`groups.read`, `learners.read`, …) по образцу соседних ручек контроллера. Если ' +
        'обработчик проверяет «своё/чужое» сам — впишите в `EXEMPT` с причиной. Так жил ' +
        'журнал учебных часов группы (журнал 341).'
    ).toEqual([]);
  });

  it('каждое исключение из EXEMPT ещё существует — мёртвых записей нет', () => {
    const routes = registryHandlers().map((h) => h.route);
    for (const { route } of EXEMPT) {
      expect(
        routes.includes(route),
        `${route} в EXEMPT, но ручки с таким адресом реестра больше нет — уберите запись`
      ).toBe(true);
    }
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор адресов сломается, ручек реестра не станет
    // и проверка выше позеленеет ни на чём. Их в бэкенде больше двадцати.
    expect(registryHandlers().length).toBeGreaterThanOrEqual(20);
    expect(learnerGrantsByMigration().length).toBeGreaterThanOrEqual(7);
  });
});
