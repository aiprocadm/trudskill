import { describe, expect, it } from 'vitest';

import {
  type ControllerHandler,
  controllerHandlers,
  describeHandler
} from '../testing/controller-inventory.test-util.js';
import {
  ROLE_RIGHTS_SNAPSHOT,
  reachableBy,
  roleGrantsByMigration
} from '../testing/role-rights.test-util.js';

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
 * набору слушателя. «Сводятся» — все объявленные права входят в его снимок; ручка
 * без прав вовсе достижима любым вошедшим и тоже считается.
 *
 * Набор прав слушателя читается из миграций (все выдачи `iam.role_permissions`, где
 * роль — `'learner'`) и сверяется со снимком живой базы: новая выдача слушателю обязана
 * появиться в снимке — и тем самым заново пройти этот сторож. Выдача в форме, которую
 * разбор не понимает, роняет отдельный тест, а не молчит. Разбор и снимок общие для
 * сторожей «до чего дотягивается роль» — `testing/role-rights.test-util.ts`.
 *
 * Исключения — `EXEMPT`, поимённо и с причиной. Мёртвая запись роняет тест.
 *
 * Проверено подсадным нарушителем: журнал группы под `progress.read` роняет тест и
 * называет маршрут с правом; снятое из снимка право роняет сверку с миграциями.
 */

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

const registryHandlers = (): ControllerHandler[] =>
  controllerHandlers().filter((h) => REGISTRY_ROUTE.test(h.route.split(' ')[1]!));

const isExempt = (h: ControllerHandler): boolean => EXEMPT.some((e) => h.route === e.route);

const registryReachableByLearner = (): string[] =>
  registryHandlers()
    .filter((h) => !isExempt(h))
    .filter((h) => reachableBy('learner', h.permissions))
    .map(describeHandler)
    .sort();

describe('правами слушателя не дотянуться до чужого реестра', () => {
  it('набор прав слушателя читается из миграций и совпадает со снимком живой базы', () => {
    const fromMigrations = new Set(roleGrantsByMigration('learner').flatMap((g) => g.codes));
    expect(
      [...fromMigrations].sort(),
      'Миграции выдают слушателю не то, что записано в ROLE_RIGHTS_SNAPSHOT.learner. Новое право ' +
        'слушателя — впишите в снимок и убедитесь, что тест ниже остался зелёным: каждое ' +
        'новое право слушателя заново открывает ручки, которые под ним стоят.'
    ).toEqual([...ROLE_RIGHTS_SNAPSHOT.learner].sort());
  });

  it('каждая выдача слушателю в миграциях прочитана — незнакомая форма не молчит', () => {
    for (const { migration, codes } of roleGrantsByMigration('learner')) {
      expect(
        codes.length,
        `${migration}: оператор INSERT в iam.role_permissions упоминает 'learner', но разбор не ` +
          'нашёл, какие коды он выдаёт. Либо поправьте разбор (roleCodesIn), либо ' +
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
    expect(roleGrantsByMigration('learner').length).toBeGreaterThanOrEqual(7);
  });
});
