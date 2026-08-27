import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

const T = 'tenant_demo';

const makeIam = (): IamService => new IamService(new AuditService());

/*
 * Ревизия 2026-08-27 (порция 29, журнал 278).
 *
 * Экран «Люди и доступ» отправлял выбранную роль в параметре СОРТИРОВКИ (`sort=role:...`),
 * которого сервер не читает вовсе: список приходил целиком, а фильтр выглядел применённым.
 * Администратор принимал по такому списку решения о доступах, считая, что видит только
 * администраторов. Фильтр по роли теперь настоящий и живёт на сервере — иначе отбор на
 * клиенте резал бы только текущую страницу и врал бы иначе.
 */
describe('список людей: фильтр по роли (порция 29)', () => {
  it('без фильтра возвращаются все', async () => {
    const iam = makeIam();
    const all = await iam.listUsers(T, { pageSize: 100 });
    expect(all.total).toBeGreaterThan(1);
  });

  it('с фильтром остаются только носители роли', async () => {
    const iam = makeIam();
    const admins = await iam.listUsers(T, { role: 'tenant_admin', pageSize: 100 });

    expect(admins.total).toBeGreaterThan(0);
    for (const user of admins.items) {
      const roles = await iam.getUserRoles(T, user.id);
      expect(roles.map((role) => role.code)).toContain('tenant_admin');
    }
    const all = await iam.listUsers(T, { pageSize: 100 });
    expect(admins.total).toBeLessThan(all.total);
  });

  it('счётчик и страницы считаются ПОСЛЕ отбора, а не до него', async () => {
    const iam = makeIam();
    const managers = await iam.listUsers(T, { role: 'manager', pageSize: 100 });
    expect(managers.total).toBe(managers.items.length);
  });

  it('роль, которой ни у кого нет, даёт пустой список, а не весь', async () => {
    const iam = makeIam();
    const nobody = await iam.listUsers(T, { role: 'no_such_role', pageSize: 100 });
    expect(nobody.items).toEqual([]);
    expect(nobody.total).toBe(0);
  });

  it('фильтр по роли сочетается с фильтром по состоянию', async () => {
    const iam = makeIam();
    const blocked = await iam.listUsers(T, { role: 'manager', status: 'blocked', pageSize: 100 });
    for (const user of blocked.items) {
      expect(user.status).toBe('blocked');
    }
  });
});
