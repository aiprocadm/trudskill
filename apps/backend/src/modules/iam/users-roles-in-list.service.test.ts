import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

const T = 'tenant_demo';

const makeIam = (): IamService => new IamService(new AuditService());

/*
 * ТЗ 5.6 (Э6), журнал 453: «колонки соответствуют доступным фильтрам».
 *
 * Экран «Люди и доступ» давал отбор по роли, а в ответе списка роли не было: таблица
 * показывала «Сотрудник / Логин / Статус», и администратор, отобравший методистов, не видел
 * на экране ни слова «методист». Проверить, что фильтр сработал, было нечем — оставалось
 * верить. Теперь список отдаёт коды ролей для строк ТЕКУЩЕЙ страницы.
 */
describe('список людей отдаёт роли своих строк (ТЗ 5.6)', () => {
  it('у каждой строки страницы есть свой набор кодов ролей', async () => {
    const iam = makeIam();
    const page = await iam.listUsers(T, { pageSize: 5 });
    const roles = await iam.roleCodesOfUsers(
      T,
      page.items.map((user) => user.id)
    );

    expect(Object.keys(roles).sort()).toEqual(page.items.map((user) => user.id).sort());
    for (const user of page.items) {
      const own = await iam.getUserRoles(T, user.id);
      expect(roles[user.id]).toEqual(own.map((role) => role.code).sort());
    }
  });

  it('человек без ролей получает пустой список, а не отсутствие ключа', async () => {
    // Пропущенный ключ на экране превратился бы в пустую ячейку, неотличимую от сбоя
    // загрузки; пустой список экран печатает словами «Роль не назначена».
    const iam = makeIam();
    const roles = await iam.roleCodesOfUsers(T, ['user_no_such']);
    expect(roles).toEqual({ user_no_such: [] });
  });

  it('пустой запрос не ходит в базу и возвращает пустую карту', async () => {
    const iam = makeIam();
    expect(await iam.roleCodesOfUsers(T, [])).toEqual({});
  });

  it('роли берутся у людей СВОЕГО центра', async () => {
    const iam = makeIam();
    const page = await iam.listUsers(T, { pageSize: 3 });
    const foreign = await iam.roleCodesOfUsers('tenant_other', [page.items[0]!.id]);
    expect(foreign[page.items[0]!.id]).toEqual([]);
  });
});
