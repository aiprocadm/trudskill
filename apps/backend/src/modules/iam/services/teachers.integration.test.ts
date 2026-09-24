import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { IamService } from './iam.service.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';
import { AuditService } from '../../audit/audit.service.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/** МГ-E4.5 (срез 17.1): выбор преподавателя курса группы — на живой базе со всеми миграциями. */
const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
}, 60_000);

function allMigrationFiles(): string[] {
  const dir = [
    join(__dirname, '../../../../migrations'),
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ].find((candidate) => existsSync(candidate));
  if (!dir) throw new Error('Каталог миграций не найден');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

const TEST_DB = { migrations: allMigrationFiles() };
const T = 'tenant_demo';

describe.skipIf(!dockerAvailable)('преподаватели центра (МГ-E4.5)', () => {
  it('в списке — только действующие с ролью «Преподаватель», поиск по ФИО; проверка роли', async () => {
    await withTestDb(TEST_DB, async (db) => {
      const users: Array<[string, string, string]> = [
        ['u_t1', 'Андреев Андрей', 'active'],
        ['u_t2', 'Борисова Бэлла', 'active'],
        ['u_t3', 'Власов Виктор', 'blocked'],
        ['u_cur', 'Кураторова Ксения', 'active']
      ];
      for (const [id, name, status] of users) {
        await db.query(
          `insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name)
           values ($1, $2, $1, $1 || '@example.ru', 'x', $3, $4)`,
          [id, T, status, name]
        );
      }
      const teacherRole = await db.query<{ id: string }>(
        `select id from iam.roles where tenant_id = $1 and code = 'teacher'`,
        [T]
      );
      const curatorRole = await db.query<{ id: string }>(
        `select id from iam.roles where tenant_id = $1 and code = 'curator'`,
        [T]
      );
      expect(teacherRole[0]).toBeTruthy();
      for (const [n, userId, roleId] of [
        [1, 'u_t1', teacherRole[0]!.id],
        [2, 'u_t2', teacherRole[0]!.id],
        [3, 'u_t3', teacherRole[0]!.id],
        [4, 'u_cur', curatorRole[0]!.id]
      ] as const) {
        await db.query(
          `insert into iam.user_roles (id, tenant_id, user_id, role_id) values ($1, $2, $3, $4)`,
          [`ur_t${n}`, T, userId, roleId]
        );
      }
      const iam = new IamService(new AuditService(), db as unknown as DatabaseService);

      const all = await iam.searchUsersByRole(T, 'teacher', '', 50);
      expect(all.map((u) => u.id)).toEqual(['u_t1', 'u_t2']);
      expect(await iam.searchUsersByRole(T, 'teacher', 'бор', 50)).toEqual([
        { id: 'u_t2', name: 'Борисова Бэлла' }
      ]);
      expect(await iam.searchUsersByRole(T, 'teacher', '%', 50)).toEqual([]);
      expect(await iam.userHasRole(T, 'u_t1', 'teacher')).toBe(true);
      expect(await iam.userHasRole(T, 'u_cur', 'teacher')).toBe(false);
      expect(await iam.userHasRole(T, 'u_t3', 'teacher')).toBe(false);
      expect(await iam.searchUsersByRole('t_other', 'teacher', '', 50)).toEqual([]);
    });
  }, 180_000);
});
