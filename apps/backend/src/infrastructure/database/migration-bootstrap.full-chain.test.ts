import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeMigrationSqlChecksum } from './migration-integrity.js';
import { isDockerAvailable } from '../../testing/with-test-db.js';

/**
 * Full-chain fresh-DB migration bootstrap guard (Issue 4).
 *
 * The production runner (`DatabaseService.runMigrations`) applies every `*.sql`
 * file in `apps/backend/migrations/` in sorted order on boot. Nothing else
 * exercises the WHOLE 0001→latest path on a clean database — the `with-test-db`
 * helper deliberately applies hand-picked subsets. This test boots its own fresh
 * container and applies the entire chain, so a migration that cannot bootstrap a
 * brand-new database fails here instead of on a customer's first deploy.
 */

function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ];
  const resolved = candidates.find((p) => existsSync(p));
  if (!resolved) {
    throw new Error(`Migrations directory not found. Checked: ${candidates.join(', ')}`);
  }
  return resolved;
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Mirrors DatabaseService.runMigrations: ensure `core.schema_migrations`, skip
 * already-applied ids, run each pending file in its own transaction, record it.
 * Returns the ids actually applied during this call (empty on a no-op re-run).
 */
async function runPendingMigrations(pool: Pool, dir: string, files: string[]): Promise<string[]> {
  await pool.query('create schema if not exists core');
  await pool.query(
    `create table if not exists core.schema_migrations (
       id text primary key, checksum text not null, applied_at timestamptz not null default now())`
  );
  const appliedRows = await pool.query<{ id: string }>('select id from core.schema_migrations');
  const applied = new Set(appliedRows.rows.map((r) => r.id));
  const justApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = computeMigrationSqlChecksum(sql);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into core.schema_migrations (id, checksum) values ($1, $2)', [
        file,
        checksum
      ]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
    justApplied.push(file);
  }
  return justApplied;
}

const EXPECTED_SCHEMAS = [
  'core',
  'iam',
  'learning',
  'assessment',
  'documents',
  'storage',
  'audit',
  'org',
  'lookup',
  'communication',
  'integrations',
  'payments'
];

describe.skipIf(!isDockerAvailable())('migration chain applies to a fresh database', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const dir = resolveMigrationsDir();
  const files = listMigrationFiles(dir);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('applies every migration in order with no error', async () => {
    const appliedNow = await runPendingMigrations(pool, dir, files);
    expect(appliedNow).toEqual(files);
    const count = await pool.query<{ n: string }>(
      'select count(*)::text as n from core.schema_migrations'
    );
    expect(Number(count.rows[0]!.n)).toBe(files.length);
  });

  it('creates all expected schemas', async () => {
    const rows = await pool.query<{ schema_name: string }>(
      'select schema_name from information_schema.schemata'
    );
    const present = new Set(rows.rows.map((r) => r.schema_name));
    for (const s of EXPECTED_SCHEMAS) expect(present.has(s), `schema ${s} missing`).toBe(true);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const appliedAgain = await runPendingMigrations(pool, dir, files);
    expect(appliedAgain).toEqual([]);
  });
});
