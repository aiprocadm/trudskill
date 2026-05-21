import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type { DatabaseService } from '../infrastructure/database/database.service.js';

/**
 * Тестовая «маленькая» реализация DatabaseService поверх одного PoolClient.
 * Каждый вызов withTestDb разворачивает callback внутри транзакции и откатывает
 * её на выходе, чтобы тесты не видели изменения друг друга.
 */
type TestDatabaseHandle = Pick<DatabaseService, 'query' | 'withTransaction'>;

let containerPromise: Promise<{
  container: StartedPostgreSqlContainer;
  pool: Pool;
}> | null = null;

const appliedMigrations = new Set<string>();

async function getOrInitContainer(migrationFiles: string[]) {
  if (!containerPromise) {
    containerPromise = (async () => {
      const container = await new PostgreSqlContainer('postgres:16').start();
      const pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
      return { container, pool };
    })();
  }
  const handle = await containerPromise;
  const missing = migrationFiles.filter((file) => !appliedMigrations.has(file));
  if (missing.length > 0) {
    await applyMigrations(handle.pool, missing);
    for (const file of missing) appliedMigrations.add(file);
  }
  return handle;
}

function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ];
  const resolved = candidates.find((path) => existsSync(path));
  if (!resolved) {
    throw new Error(`Migrations directory not found. Checked: ${candidates.join(', ')}`);
  }
  return resolved;
}

/**
 * Применяет миграции из переданного списка (по именам файлов). Каждый файл —
 * в отдельной транзакции, как в production-`DatabaseService.runMigrations`.
 *
 * Принимаем явный список вместо применения «всех» миграций по двум причинам:
 *  1. Текущие миграции содержат пред-история-зависимости (например, 0003
 *     дважды дропает один constraint, что ломается на свежей БД). Тестам это
 *     не нужно, и они не должны зависеть от инвариантов всей цепочки.
 *  2. Тест на конкретную фичу должен зависеть от минимального схемного
 *     поверхности — это снижает связность и ускоряет тесты.
 */
async function applyMigrations(pool: Pool, migrationFiles: string[]): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  const client = await pool.connect();
  try {
    await client.query('create schema if not exists iam');
    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

export interface WithTestDbOptions {
  /** Migration filenames to apply before the callback. Order matters. */
  migrations: string[];
}

export async function withTestDb<T>(
  options: WithTestDbOptions,
  callback: (db: TestDatabaseHandle) => Promise<T>
): Promise<T> {
  const { pool } = await getOrInitContainer(options.migrations);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const handle: TestDatabaseHandle = {
      async query<TRow extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = [],
        explicitClient?: PoolClient
      ): Promise<TRow[]> {
        const executor = explicitClient ?? client;
        const result = await executor.query<TRow>(sql, params);
        return result.rows;
      },
      async withTransaction<TResult>(cb: (txClient: PoolClient) => Promise<TResult>) {
        const savepoint = `sp_${Math.random().toString(36).slice(2, 10)}`;
        await client.query(`savepoint ${savepoint}`);
        try {
          const result = await cb(client);
          await client.query(`release savepoint ${savepoint}`);
          return result;
        } catch (error) {
          await client.query(`rollback to savepoint ${savepoint}`);
          throw error;
        }
      }
    };
    return await callback(handle);
  } finally {
    try {
      await client.query('rollback');
    } finally {
      client.release();
    }
  }
}

/**
 * Останавливает singleton-контейнер. Вызывается в afterAll тестового файла —
 * Vitest при импорте helper'а не получит hook автоматически, поэтому это
 * ответственность теста.
 */
export async function stopTestDb(): Promise<void> {
  if (!containerPromise) return;
  const { container, pool } = await containerPromise;
  await pool.end();
  await container.stop();
  containerPromise = null;
  appliedMigrations.clear();
}
