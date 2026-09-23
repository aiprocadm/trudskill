import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Проекция контрагентов и групп при сохранении снимка — на НАСТОЯЩЕЙ базе после всей цепочки
 * миграций (Фаза 1, срез 1a, РМ35). Проверяется ровно то, что мок доказать не может: та же
 * транзакция и настоящие ограничения. Дубль кода группы отклоняется базой — и снимок всё
 * равно сохраняется; контрагент, на которого ссылаются группы, удаляется без нарушения ключа;
 * присваивание коллекции целиком выметает из таблицы строки, которых в снимке больше нет.
 */

const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
}, 60_000);

function allMigrationFiles(): string[] {
  const dir = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ].find((candidate) => existsSync(candidate));
  if (!dir) throw new Error('Каталог миграций не найден');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

const TEST_DB = { migrations: allMigrationFiles() };
const T = 't_projection';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

const rows = async (db: Db, table: 'crm.counterparties' | 'learning.groups') =>
  db.query<Record<string, unknown>>(
    table === 'crm.counterparties'
      ? `select id, code, name, status, payload from crm.counterparties where tenant_id = $1 order by id`
      : `select id, code, name, status, counterparty_id, payload from learning.groups where tenant_id = $1 order by id`,
    [T]
  );

const issues = async (db: Db) =>
  db.query<{ collection: string; entity_id: string | null; details: { message: string } }>(
    `select collection, entity_id, details from learning.mvp_reconciliation_log
      where tenant_id = $1 and issue_type = 'projection_failed' order by id`,
    [T]
  );

describe.skipIf(!dockerAvailable)(
  'проекция при сохранении снимка на живой базе (Фаза 1, срез 1a)',
  () => {
    it('таблицы догоняют снимок, а отказ базы по одной группе не откатывает сохранение', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await db.query(
          `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
          [T]
        );
        const backend = new PostgresMvpPersistenceBackend(db as DatabaseService);

        // 1. Первое сохранение: контрагент и две группы (одна — с контрагентом).
        const first = new InMemoryMvpState();
        await backend.loadIntoState(T, first);
        first.counterparties.push({
          id: 'cp1',
          tenantId: T,
          ...AT,
          code: 'CP-1',
          name: 'Ромашка',
          status: 'active',
          inn: '7707083893'
        } as never);
        first.groups.push(
          {
            id: 'g1',
            tenantId: T,
            ...AT,
            code: 'G-1',
            name: 'Первая',
            status: 'active',
            counterpartyId: 'cp1'
          } as never,
          { id: 'g2', tenantId: T, ...AT, code: 'G-2', name: 'Вторая', status: 'closed' } as never
        );
        await backend.saveFromState(T, first);

        expect((await rows(db, 'crm.counterparties')).map((r) => r.code)).toEqual(['CP-1']);
        expect(await rows(db, 'learning.groups')).toMatchObject([
          { id: 'g1', code: 'G-1', counterparty_id: 'cp1', status: 'active' },
          { id: 'g2', code: 'G-2', counterparty_id: null, status: 'closed' }
        ]);

        // 2. Правка + дубль кода: снимок сохранён целиком, дубль — в журнал сверки.
        const second = new InMemoryMvpState();
        await backend.loadIntoState(T, second);
        (second.groups.find((g) => g.id === 'g2') as { name: string }).name = 'Переименованная';
        second.groups.push({
          id: 'g_dup',
          tenantId: T,
          ...AT,
          code: 'G-1',
          name: 'Дубль',
          status: 'active'
        } as never);
        await backend.saveFromState(T, second);

        const snapshotGroups = await db.query<{ id: string }>(
          `select id from learning.mvp_runtime_documents where tenant_id = $1 and collection = 'groups' order by id`,
          [T]
        );
        expect(snapshotGroups.map((r) => r.id)).toEqual(['g1', 'g2', 'g_dup']);
        const tableGroups = await rows(db, 'learning.groups');
        expect(tableGroups.map((r) => r.id)).toEqual(['g1', 'g2']);
        expect(tableGroups[1]).toMatchObject({ name: 'Переименованная' });
        const failed = await issues(db);
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({ collection: 'groups', entity_id: 'g_dup' });
        expect(failed[0]!.details.message).toMatch(/unique|уникальн|duplicate/i);

        // 3. Удаление контрагента, на которого ссылается g1: ссылка обнуляется, контрагент уходит.
        const third = new InMemoryMvpState();
        await backend.loadIntoState(T, third);
        third.counterparties.splice(0, third.counterparties.length);
        await backend.saveFromState(T, third);

        expect(await rows(db, 'crm.counterparties')).toEqual([]);
        const g1 = (await rows(db, 'learning.groups')).find((r) => r.id === 'g1')!;
        expect(g1.counterparty_id).toBeNull();
        expect((g1.payload as Record<string, unknown>).counterpartyId).toBe('cp1');
        expect(await issues(db)).toHaveLength(1);

        // 4. Лишняя строка в таблице (например, от бэкфилла) + присвоение коллекции целиком → выметается.
        await db.query(
          `insert into learning.groups (id, tenant_id, code, name, status) values ('g_stale', $1, 'G-STALE', 'Лишняя', 'draft')`,
          [T]
        );
        const fourth = new InMemoryMvpState();
        await backend.loadIntoState(T, fourth);
        fourth.groups = fourth.groups.filter((g) => g.id !== 'g_dup');
        await backend.saveFromState(T, fourth);

        expect((await rows(db, 'learning.groups')).map((r) => r.id)).toEqual(['g1', 'g2']);
      });
    }, 180_000);
  }
);
