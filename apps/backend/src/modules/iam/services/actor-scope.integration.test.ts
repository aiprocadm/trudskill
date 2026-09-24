import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { IamService } from './iam.service.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';
import { AuditService } from '../../audit/audit.service.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Журнал 647: скоуп портала заказчика строится по `iam.users.counterparty_id`, и пустая
 * привязка значит «персонал центра, видит всех». Представитель без привязки — роль выдали
 * правкой ролей или компанию удалили (`ON DELETE SET NULL`) — обязан быть помечен, чтобы
 * гвард закрыл ему доступ, а не открыл весь центр. Проверяется на живой базе со всеми
 * миграциями: роль `counterparty_rep` засевает 0071.
 */
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

describe.skipIf(!dockerAvailable)('скоуп актора: представитель без привязки (журнал 647)', () => {
  it('роль представителя без компании — пометка; с компанией — скоуп; сотрудник — ни того ни другого', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await db.query(
        `insert into crm.counterparties (id, tenant_id, code, name, status, payload)
         values ('cp_scope', $1, 'CP-SCOPE', 'Ромашка', 'active', '{}'::jsonb)`,
        [T]
      );
      for (const [id, counterpartyId] of [
        ['u_rep_unlinked', null],
        ['u_rep_linked', 'cp_scope'],
        ['u_staff_plain', null]
      ] as const) {
        await db.query(
          `insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name, counterparty_id)
           values ($1, $2, $1, $1 || '@example.ru', 'x', 'active', $1, $3)`,
          [id, T, counterpartyId]
        );
      }
      await db.query(
        `insert into iam.user_roles (id, tenant_id, user_id, role_id)
         values ('ur_rep_1', $1, 'u_rep_unlinked', 'r_counterparty_rep'),
                ('ur_rep_2', $1, 'u_rep_linked', 'r_counterparty_rep')`,
        [T]
      );

      const iam = new IamService(new AuditService(), db as unknown as DatabaseService);

      const unlinked = await iam.resolveActorScope(T, 'u_rep_unlinked');
      expect(unlinked.unlinkedRepresentative).toBe(true);
      expect(unlinked.counterpartyId).toBeUndefined();
      expect(unlinked.permissions).toContain('portal.read');

      const linked = await iam.resolveActorScope(T, 'u_rep_linked');
      expect(linked).toMatchObject({ counterpartyId: 'cp_scope' });
      expect(linked.unlinkedRepresentative).toBeUndefined();

      const staff = await iam.resolveActorScope(T, 'u_staff_plain');
      expect(staff.unlinkedRepresentative).toBeUndefined();
      expect(staff.counterpartyId).toBeUndefined();
    });
  }, 180_000);
});
