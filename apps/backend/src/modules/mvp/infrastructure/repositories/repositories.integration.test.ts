import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  COUNTERPARTY_SORT_COLUMNS,
  PostgresCounterpartiesRepository
} from './postgres-counterparties.repository.js';
import { GROUP_SORT_COLUMNS, PostgresGroupsRepository } from './postgres-groups.repository.js';
import { parseRegistryListQuery } from './registry-list-query.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../../testing/with-test-db.js';
import {
  TABLE_SPECS,
  emptyContext,
  projectEntity
} from '../../../migration/backfill/normalized/normalized-projection.js';
import { upsertRows } from '../../../migration/backfill/normalized/normalized-upsert.js';

import type { DatabaseService } from '../../../../infrastructure/database/database.service.js';

/**
 * SQL-репозитории контрагентов и групп на НАСТОЯЩЕЙ базе (Фаза 1, срез 1b, МГ-A2.1): страница
 * базы, `total`, поиск по коду/названию/ИНН/полям импорта, статус, сортировка по белому списку с
 * добивкой по `id`, изоляция центров, скоуп портала, форма ответа равна снимку (поля импорта из
 * `payload`, исходный статус).
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
const T = 't_repo';
const T2 = 't_repo_other';
const at = (day: number) => ({
  createdAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  updatedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`
});

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

async function seed(db: Db): Promise<void> {
  for (const tenant of [T, T2]) {
    await db.query(
      `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
      [tenant]
    );
  }
  const cps = [
    {
      id: 'cp1',
      tenantId: T,
      ...at(1),
      code: 'CP-1',
      name: 'Ромашка',
      status: 'active',
      inn: '7707083893',
      contractNumber: 'Д-7'
    },
    {
      id: 'cp2',
      tenantId: T,
      ...at(2),
      code: 'CP-2',
      name: 'Лютик',
      status: 'blocked',
      inn: 'bad'
    },
    { id: 'cp3', tenantId: T, ...at(3), code: 'CP-3', name: 'Василёк', status: 'archived' },
    { id: 'cp9', tenantId: T2, ...at(1), code: 'CP-1', name: 'Ромашка чужая', status: 'active' }
  ];
  const groups = [
    {
      id: 'g1',
      tenantId: T,
      ...at(1),
      code: '2024-01',
      name: 'Охрана труда',
      status: 'active',
      counterpartyId: 'cp1'
    },
    {
      id: 'g2',
      tenantId: T,
      ...at(2),
      code: '2024-02',
      name: 'Пожарная безопасность',
      status: 'closed',
      counterpartyId: 'cp2',
      legacyNumber: '77',
      comment: 'вечерняя смена'
    },
    {
      id: 'g3',
      tenantId: T,
      ...at(3),
      code: '2025-01',
      name: 'Электробезопасность',
      status: 'active'
    },
    { id: 'g9', tenantId: T2, ...at(1), code: '2024-01', name: 'Чужая', status: 'active' }
  ];
  await db.withTransaction(async (client) => {
    for (const tenant of [T, T2]) {
      await upsertRows(
        client,
        TABLE_SPECS.counterparties,
        cps
          .filter((c) => c.tenantId === tenant)
          .map((c) => projectEntity('counterparties', tenant, c, emptyContext()))
      );
    }
    const ctx = emptyContext();
    ctx.counterparties.add('cp1');
    ctx.counterparties.add('cp2');
    for (const tenant of [T, T2]) {
      await upsertRows(
        client,
        TABLE_SPECS.groups,
        groups
          .filter((g) => g.tenantId === tenant)
          .map((g) => projectEntity('groups', tenant, g, ctx))
      );
    }
  });
}

const q = (
  query: Record<string, unknown>,
  scope?: { counterpartyId?: string },
  sortColumns = GROUP_SORT_COLUMNS
) => parseRegistryListQuery(query as never, sortColumns, scope);

describe.skipIf(!dockerAvailable)('SQL-репозитории контрагентов и групп (Фаза 1, срез 1b)', () => {
  it('списки, поиск, статус, сортировка, страницы, изоляция и скоуп — на живой базе', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seed(db);
      const groupsRepo = new PostgresGroupsRepository(db as DatabaseService);
      const cpRepo = new PostgresCounterpartiesRepository(db as DatabaseService);

      // Изоляция центров и порядок по умолчанию (created_at asc, id asc).
      const all = await groupsRepo.list(T, q({}));
      expect(all.items.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
      expect(all).toMatchObject({ page: 1, pageSize: 50, total: 3 });

      // Форма ответа равна снимку: поля импорта из payload, исходный статус контрагента.
      expect(all.items[1]).toMatchObject({
        id: 'g2',
        tenantId: T,
        code: '2024-02',
        name: 'Пожарная безопасность',
        status: 'closed',
        counterpartyId: 'cp2',
        legacyNumber: '77',
        createdAt: '2026-09-02T10:00:00.000Z'
      });
      const cp2 = await cpRepo.get(T, 'cp2');
      expect(cp2).toMatchObject({ id: 'cp2', status: 'blocked', inn: 'bad' });
      expect(await cpRepo.get(T2, 'cp2')).toBeNull();
      expect(await groupsRepo.get(T, 'g9')).toBeNull();

      // Страницы и total.
      const page2 = await groupsRepo.list(T, q({ page: '2', page_size: '2' }));
      expect(page2.items.map((g) => g.id)).toEqual(['g3']);
      expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 });

      // Поиск: по коду, по названию без учёта регистра, по полю импорта из payload.
      expect((await groupsRepo.list(T, q({ q: '2024-0' }))).items.map((g) => g.id)).toEqual([
        'g1',
        'g2'
      ]);
      expect((await groupsRepo.list(T, q({ q: 'ЭЛЕКТРО' }))).items.map((g) => g.id)).toEqual([
        'g3'
      ]);
      expect((await groupsRepo.list(T, q({ q: '77' }))).items.map((g) => g.id)).toEqual(['g2']);
      expect((await groupsRepo.list(T, q({ q: 'вечерн' }))).items.map((g) => g.id)).toEqual(['g2']);
      expect(
        (await cpRepo.list(T, q({ q: 'Д-7' }, undefined, COUNTERPARTY_SORT_COLUMNS))).items.map(
          (c) => c.id
        )
      ).toEqual(['cp1']);
      expect(
        (await cpRepo.list(T, q({ q: '7707' }, undefined, COUNTERPARTY_SORT_COLUMNS))).items.map(
          (c) => c.id
        )
      ).toEqual(['cp1']);
      // Спецсимвол шаблона экранируется: «%» ничего не находит, а не всё подряд.
      expect((await groupsRepo.list(T, q({ q: '%' }))).total).toBe(0);

      // Статус и сортировка по белому списку.
      expect((await groupsRepo.list(T, q({ status: 'active' }))).items.map((g) => g.id)).toEqual([
        'g1',
        'g3'
      ]);
      expect((await groupsRepo.list(T, q({ sort: 'name:desc' }))).items.map((g) => g.name)).toEqual(
        ['Электробезопасность', 'Пожарная безопасность', 'Охрана труда']
      );
      expect(
        (
          await cpRepo.list(T, q({ sort: 'inn:asc' }, undefined, COUNTERPARTY_SORT_COLUMNS))
        ).items.map((c) => c.id)
      ).toEqual(['cp1', 'cp2', 'cp3']);

      // Скоуп портала: только группы своего контрагента; группа без контрагента не видна.
      expect(
        (await groupsRepo.list(T, q({}, { counterpartyId: 'cp1' }))).items.map((g) => g.id)
      ).toEqual(['g1']);
      expect(
        (
          await cpRepo.list(T, q({}, { counterpartyId: 'cp1' }, COUNTERPARTY_SORT_COLUMNS))
        ).items.map((c) => c.id)
      ).toEqual(['cp1']);

      // Lookup: id, подпись, статус.
      expect((await groupsRepo.lookup(T, q({ q: 'охрана' }))).items).toEqual([
        { id: 'g1', label: 'Охрана труда', status: 'active' }
      ]);
    });
  }, 180_000);
});
