import { describe, expect, it } from 'vitest';

import {
  type Screen,
  arrayBody,
  readNavigationModel,
  readRoleBlueprints
} from '../testing/navigation-model.test-util.js';
import {
  EXPLICIT_GRANT_ROLES,
  ROLE_RIGHTS_SNAPSHOT,
  type RoleCode,
  reachableBy,
  roleGrantsByMigration
} from '../testing/role-rights.test-util.js';

/**
 * Шестнадцатый сторож семейства «объявлено — кто это исполняет»: **короткое меню роли
 * обещает только то, что роль может открыть, — и только своё.**
 *
 * Чертёж меню (`features/navigation/role-blueprints.ts`, `primaryNav`) — продуктовое
 * решение ТЗ редизайна §4.4: шесть-семь разделов, с которых роль начинает день. Но чертёж
 * составлялся по названиям разделов, а не по правам: `getNavigationView` берёт из чертежа
 * только пункты, видимые по правам сессии, и МОЛЧА пропускает остальные, а недостающее до
 * семи добивает любыми видимыми пунктами. Так жил методист (журнал 344): чертёж обещал ему
 * «Группы» и «Отчёты», а `groups.read` и `learners.read` у роли нет — пункты не показывались,
 * и меню добивалось «Мои тесты» и «Мои задания» из кабинета слушателя.
 *
 * Инварианты:
 *  1. Каждый адрес `primaryNav` — пункт `navigationModel`, чьи права входят в снимок прав
 *     роли (`testing/role-rights.test-util.ts`). Без прав вовсе — виден любому, годится.
 *  2. Пункт принадлежит адресату меню: у роли сотрудника в чертеже нет кабинета слушателя
 *     (`/learner/**`), у слушателя — только его кабинет и общие пункты (`SHARED`).
 *     Правило добивания меню теми же адресатами живёт во фронте (`helpers.ts`,
 *     `getNavigationView`) и проверяется его тестами; здесь — что сам чертёж ему не
 *     противоречит.
 *
 * Снимок прав ролей: для ролей с явными перечнями (`EXPLICIT_GRANT_ROLES`) — совпадает с
 * миграциями целиком; администраторам 0010 выдаёт «всё» без перечня, для них из миграций
 * выводится часть и сверяется как подмножество. Незнакомая форма выдачи роняет отдельный
 * тест, а не молчит.
 *
 * Проверено подсадным нарушителем: `/groups` в чертеже методиста роняет тест и называет
 * роль, адрес и недостающее право; `/learner/tests` в чертеже менеджера роняет тест
 * адресата.
 */

/** Пункты без адресата — годятся любой роли, слушателю в том числе. */
/*
 * ТЗ 15.5: «Сообщить о проблеме» — общий экран по замыслу. Именно у слушателя чаще всего
 * что-то не открывается, и именно он не дозвонится в центр вечером. Данных сотрудников там
 * нет вовсе: экран принимает описание и адрес страницы, а роль и версию подставляет сервер
 * (журнал 583).
 */
const SHARED = new Set(['/', '/notifications', '/chat', '/learning/calendar']);

const isLearnerCabinet = (href: string): boolean =>
  href === '/learner' || href.startsWith('/learner/');

const isRoleCode = (role: string): role is RoleCode => role in ROLE_RIGHTS_SNAPSHOT;

const menuOf = (): Array<{ role: RoleCode; href: string; item: Screen | undefined }> => {
  const byHref = new Map(readNavigationModel().nav.map((item) => [item.path, item]));
  return readRoleBlueprints().blueprints.flatMap(({ role, primaryNav }) => {
    if (!isRoleCode(role)) throw new Error(`чертёж для роли ${role}, а её снимка прав нет`);
    return primaryNav.map((href) => ({ role, href, item: byHref.get(href) }));
  });
};

const unreachableMenuItems = (): string[] =>
  menuOf()
    .filter(({ role, item }) => !item || !reachableBy(role, item.permissions))
    .map(({ role, href, item }) =>
      item
        ? `${role} → ${href}: нет права ${item.permissions.filter((p) => !ROLE_RIGHTS_SNAPSHOT[role].has(p)).join(', ')}`
        : `${role} → ${href}: такого пункта меню нет`
    )
    .sort();

const foreignMenuItems = (): string[] =>
  menuOf()
    .filter(({ role, href }) =>
      role === 'learner' ? !isLearnerCabinet(href) && !SHARED.has(href) : isLearnerCabinet(href)
    )
    .map(({ role, href }) => `${role} → ${href}`)
    .sort();

describe('короткое меню роли обещает только то, что роль может открыть, — и только своё', () => {
  it('набор прав каждой роли читается из миграций и сходится со снимком живой базы', () => {
    for (const role of Object.keys(ROLE_RIGHTS_SNAPSHOT) as RoleCode[]) {
      const fromMigrations = new Set(roleGrantsByMigration(role).flatMap((g) => g.codes));
      const snapshot = ROLE_RIGHTS_SNAPSHOT[role];
      if (EXPLICIT_GRANT_ROLES.includes(role)) {
        expect(
          [...fromMigrations].sort(),
          `${role}: миграции выдают не то, что записано в ROLE_RIGHTS_SNAPSHOT. Новое право ` +
            'роли — впишите в снимок и убедитесь, что тест ниже остался зелёным.'
        ).toEqual([...snapshot].sort());
      } else {
        expect(
          [...fromMigrations].filter((code) => !snapshot.has(code)),
          `${role}: миграции выдают права, которых нет в снимке ROLE_RIGHTS_SNAPSHOT — впишите.`
        ).toEqual([]);
      }
    }
  });

  it('каждая выдача роли в миграциях прочитана — незнакомая форма не молчит', () => {
    for (const role of EXPLICIT_GRANT_ROLES) {
      for (const { migration, codes } of roleGrantsByMigration(role)) {
        expect(
          codes.length,
          `${migration}: оператор INSERT в iam.role_permissions упоминает '${role}', но разбор ` +
            'не нашёл, какие коды он выдаёт. Либо поправьте разбор (roleCodesIn), либо ' +
            'приведите выдачу к одной из известных форм.'
        ).toBeGreaterThan(0);
      }
    }
  });

  it('каждый пункт короткого меню роли открывается её правами', () => {
    expect(
      unreachableMenuItems(),
      'Чертёж обещает роли раздел, который её правами не открыть: getNavigationView молча ' +
        'пропустит пункт и добьёт меню чем придётся. Либо это право роли положено — тогда ' +
        'выдайте его миграцией (решение владельца: права ролям), либо замените пункт ' +
        'разделом, куда роль действительно ходит. Так жили «Группы» и «Отчёты» у методиста ' +
        '(журнал 344).'
    ).toEqual([]);
  });

  it('пункт меню принадлежит адресату: сотруднику — разделы сотрудника, слушателю — кабинет', () => {
    expect(
      foreignMenuItems(),
      'В чертеже роли сотрудника — кабинет слушателя, или у слушателя — раздел сотрудника. ' +
        'Меню роли собирается из её разделов; общие для всех пункты — в SHARED.'
    ).toEqual([]);
  });

  it('чертежи прочитаны целиком — незнакомая форма записи не молчит', () => {
    const { blueprints, source } = readRoleBlueprints();
    const body = arrayBody(source, 'roleBlueprints');
    expect(blueprints.length).toBe((body.match(/role:/g) ?? []).length);
    expect(blueprints.length).toBeGreaterThanOrEqual(6);
    for (const { role, primaryNav } of blueprints) {
      expect(primaryNav.length, `${role}: короткое меню пустое`).toBeGreaterThanOrEqual(5);
    }
  });
});
