import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { PostgresCounterpartyPeopleRepository } from './postgres-counterparty-people.repository.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { CounterpartyEmployee } from './counterparty-people.types.js';
import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { Counterparty } from '../mvp.types.js';

/**
 * МГ-D2.1 (срез 14.1) на живой базе со всеми миграциями: досоздание строки компании (РМ116),
 * два сотрудника без табельного номера (РМ117, 0116 ослабила `NULLS NOT DISTINCT`), номер —
 * уникален, изоляция центров.
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
const NOW = '2026-09-24T10:00:00.000Z';

const company: Counterparty = {
  id: 'cp_people',
  tenantId: T,
  code: 'CP-PEOPLE',
  name: 'Ромашка',
  inn: '7707083893',
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW
};

const employee = (id: string, extra: Partial<CounterpartyEmployee> = {}): CounterpartyEmployee => ({
  id,
  tenantId: T,
  counterpartyId: company.id,
  lastName: 'Иванов',
  firstName: id,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra
});

describe.skipIf(!dockerAvailable)('люди компании в Postgres (МГ-D2.1)', () => {
  it('компании нет в таблице — строка досоздаётся; два сотрудника без номера; номер уникален', async () => {
    await withTestDb(TEST_DB, async (db) => {
      const repo = new PostgresCounterpartyPeopleRepository(db as unknown as DatabaseService);

      await repo.saveContact(T, company, {
        id: 'cc_1',
        tenantId: T,
        counterpartyId: company.id,
        firstName: 'Анна',
        email: 'hr@romashka.ru',
        isPrimary: true,
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW
      });
      const [row] = await db.query<{ name: string; inn: string }>(
        `select name, inn from crm.counterparties where tenant_id = $1 and id = $2`,
        [T, company.id]
      );
      expect(row).toEqual({ name: 'Ромашка', inn: '7707083893' });

      await repo.saveContact(T, company, {
        id: 'cc_2',
        tenantId: T,
        counterpartyId: company.id,
        firstName: 'Олег',
        isPrimary: true,
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW
      });
      const contacts = await repo.listContacts(T, company.id);
      expect(contacts.map((c) => [c.id, c.isPrimary])).toEqual([
        ['cc_2', true],
        ['cc_1', false]
      ]);

      await repo.saveEmployees(T, company, [
        employee('e1'),
        employee('e2'),
        employee('e3', { employeeNo: '17', learnerId: 'l_1' })
      ]);
      const page = await repo.listEmployees(T, company.id, { page: 1, pageSize: 2 });
      expect(page.total).toBe(3);
      expect(page.items.map((e) => e.id)).toEqual(['e1', 'e2']);
      expect(await repo.findEmployeeByNumber(T, company.id, '17')).toMatchObject({ id: 'e3' });
      expect(await repo.findEmployeeByLearner(T, 'l_1')).toMatchObject({ id: 'e3' });
      expect(
        await repo.listEmployees('t_other', company.id, { page: 1, pageSize: 50 })
      ).toMatchObject({ total: 0 });

      // Последним: отказ базы обрывает транзакцию теста, дальше запросов нет.
      await expect(
        repo.saveEmployees(T, company, [employee('e4', { employeeNo: '17' })])
      ).rejects.toThrow();
    });
  }, 180_000);
});
