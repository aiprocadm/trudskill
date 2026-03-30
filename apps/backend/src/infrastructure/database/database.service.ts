import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { backendEnv } from '../../env.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private readonly migrationsTable = 'core.schema_migrations';

  async onModuleInit(): Promise<void> {
    this.getPool();
    if (backendEnv.DB_MIGRATIONS_ENABLED) {
      await this.runMigrations();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('select 1 as ok');
      return true;
    } catch {
      return false;
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
    client?: PoolClient
  ): Promise<T[]> {
    const executor = client ?? this.getPool();
    const result = await executor.query<T>(sql, params);
    return result.rows;
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('create schema if not exists core');
      await client.query(`
        create table if not exists ${this.migrationsTable} (
          id text primary key,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `);
    });

    const migrationsDir = this.resolveMigrationsDir();
    const migrationFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const appliedRows = await this.query<{ id: string }>(`select id from ${this.migrationsTable}`);
    const applied = new Set(appliedRows.map((row) => row.id));

    for (const file of migrationFiles) {
      if (applied.has(file)) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const checksum = Buffer.from(sql).toString('base64url');

      await this.withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          `insert into ${this.migrationsTable} (id, checksum) values ($1, $2) on conflict (id) do nothing`,
          [file, checksum]
        );
      });

      this.logger.log(`Applied migration ${file}`);
    }
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: backendEnv.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000
      });
    }
    return this.pool;
  }

  private resolveMigrationsDir(): string {
    const candidates = [
      join(process.cwd(), backendEnv.DB_MIGRATIONS_DIR),
      join(process.cwd(), 'apps/backend/migrations')
    ];

    const resolved = candidates.find((path) => existsSync(path));
    if (!resolved) {
      throw new Error(`Migrations directory not found. Checked: ${candidates.join(', ')}`);
    }

    return resolved;
  }
}
