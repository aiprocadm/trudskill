import { afterAll, describe, expect, it } from 'vitest';

import {
  TenantStateConflictError,
  bumpTenantStateVersion,
  readTenantStateVersion
} from './tenant-state-version.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../testing/with-test-db.js';

/**
 * Линия обороны 1 программы 272+292 на НАСТОЯЩЕЙ базе.
 *
 * Проверяется ровно тот случай, ради которого версия заведена: два писателя прочитали одно
 * состояние (в проде — два экземпляра за прокси, замок арендатора у каждого свой, в памяти),
 * и второй не должен переписать снимок поверх первого.
 *
 * Настоящая одновременность здесь не нужна и была бы враньём: гонка определяется не тем,
 * что запросы идут в одну миллисекунду, а тем, что ОБА взяли одну версию до записи. Это
 * воспроизводится последовательно и однозначно.
 */

const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
}, 60_000);

const TEST_DB = { migrations: ['0001_backend_foundation.sql', '0087_tenant_state_versions.sql'] };

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  tenantId: string
): Promise<void> {
  await db.query(
    `insert into core.tenants (id, code, name, status)
     values ($1, $1, $1, 'active')
     on conflict (id) do nothing`,
    [tenantId]
  );
}

describe.skipIf(!dockerAvailable)('версия состояния арендатора (журнал 272/292)', () => {
  it('у арендатора, чей снимок ещё не писали, версия равна нулю', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_fresh');

      const version = await readTenantStateVersion(
        (sql, params) => db.query<{ version: string | number }>(sql, params),
        't_fresh',
        'mvp'
      );

      expect(version).toBe(0);
    });
  });

  it('обычная запись увеличивает версию на единицу', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_seq');
      const read = () =>
        readTenantStateVersion(
          (sql, params) => db.query<{ version: string | number }>(sql, params),
          't_seq',
          'mvp'
        );

      await db.withTransaction((client) => bumpTenantStateVersion(client, 't_seq', 'mvp', 0));
      expect(await read()).toBe(1);

      await db.withTransaction((client) => bumpTenantStateVersion(client, 't_seq', 'mvp', 1));
      expect(await read()).toBe(2);
    });
  });

  it('ВТОРОЙ писатель, читавший ту же версию, получает конфликт вместо тихой перезаписи', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_race');

      // Оба «экземпляра» прочитали состояние до чьей-либо записи.
      const versionSeenByA = 0;
      const versionSeenByB = 0;

      await db.withTransaction((client) =>
        bumpTenantStateVersion(client, 't_race', 'mvp', versionSeenByA)
      );

      await expect(
        db.withTransaction((client) =>
          bumpTenantStateVersion(client, 't_race', 'mvp', versionSeenByB)
        )
      ).rejects.toBeInstanceOf(TenantStateConflictError);
    });
  });

  it('запись первого писателя при этом ЦЕЛА — конфликт не откатывает чужую работу', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_intact');

      await db.withTransaction((client) => bumpTenantStateVersion(client, 't_intact', 'mvp', 0));
      await db
        .withTransaction((client) => bumpTenantStateVersion(client, 't_intact', 'mvp', 0))
        .catch(() => undefined);

      const version = await readTenantStateVersion(
        (sql, params) => db.query<{ version: string | number }>(sql, params),
        't_intact',
        'mvp'
      );
      // Единица, а не двойка: вторая запись не прошла и версию не двигала.
      expect(version).toBe(1);
    });
  });

  it('снимки mvp и documents считаются отдельно — чужая запись не мешает', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_scopes');

      await db.withTransaction((client) => bumpTenantStateVersion(client, 't_scopes', 'mvp', 0));
      // documents ещё ни разу не писали, его версия по-прежнему 0 — запись обязана пройти.
      await expect(
        db.withTransaction((client) => bumpTenantStateVersion(client, 't_scopes', 'documents', 0))
      ).resolves.toBeUndefined();
    });
  });

  it('конфликт объясняет человеку, что произошло и что делать', async () => {
    const error = new TenantStateConflictError('t1', 'documents');
    const body = error.getResponse() as { code: string; message: string };

    expect(body.code).toBe('tenant_state_conflict');
    expect(body.message).toContain('Обновите страницу');
    expect(error.getStatus()).toBe(409);
  });
});
