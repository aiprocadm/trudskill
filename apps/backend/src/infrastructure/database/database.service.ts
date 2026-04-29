import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import {
  assertAppliedMigrationUnchanged,
  computeMigrationSqlChecksum
} from './migration-integrity.js';
import { backendEnv } from '../../env.js';

export interface MigrationReadiness {
  healthy: boolean;
  appliedCount: number;
  pendingCount: number;
  pending: string[];
}

export interface QueueReadiness {
  connected: boolean;
  backlog: number;
  lagSeconds: number;
  backlogThreshold: number;
  lagThresholdSeconds: number;
  healthy: boolean;
}

export interface OutboxReadiness {
  backlog: number;
  backlogThreshold: number;
  healthy: boolean;
}

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

  async getMigrationReadiness(): Promise<MigrationReadiness> {
    const migrationsDir = this.resolveMigrationsDir();
    const migrationFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const tableRows = await this.query<{ exists: string | null }>(
      'select to_regclass($1) as exists',
      [this.migrationsTable]
    );
    const tableExists = Boolean(tableRows[0]?.exists);
    if (!tableExists) {
      return {
        healthy: false,
        appliedCount: 0,
        pendingCount: migrationFiles.length,
        pending: migrationFiles
      };
    }

    const appliedRows = await this.query<{ id: string }>(`select id from ${this.migrationsTable}`);
    const applied = new Set(appliedRows.map((row) => row.id));
    const pending = migrationFiles.filter((file) => !applied.has(file));

    return {
      healthy: pending.length === 0,
      appliedCount: appliedRows.length,
      pendingCount: pending.length,
      pending
    };
  }

  async getQueueReadiness(thresholds: {
    backlogThreshold: number;
    lagThresholdSeconds: number;
  }): Promise<QueueReadiness> {
    try {
      const rows = await this.query<{ backlog: number; lag_seconds: number | null }>(
        `
          select
            count(*)::int as backlog,
            coalesce(extract(epoch from now() - min(requested_at)), 0)::int as lag_seconds
          from integrations.sync_jobs
          where status in ('queued', 'retry')
        `
      );
      const backlog = Number(rows[0]?.backlog ?? 0);
      const lagSeconds = Number(rows[0]?.lag_seconds ?? 0);

      return {
        connected: true,
        backlog,
        lagSeconds,
        backlogThreshold: thresholds.backlogThreshold,
        lagThresholdSeconds: thresholds.lagThresholdSeconds,
        healthy:
          backlog <= thresholds.backlogThreshold && lagSeconds <= thresholds.lagThresholdSeconds
      };
    } catch {
      return {
        connected: false,
        backlog: Number.POSITIVE_INFINITY,
        lagSeconds: Number.POSITIVE_INFINITY,
        backlogThreshold: thresholds.backlogThreshold,
        lagThresholdSeconds: thresholds.lagThresholdSeconds,
        healthy: false
      };
    }
  }

  async getOutboxReadiness(backlogThreshold: number): Promise<OutboxReadiness> {
    try {
      const rows = await this.query<{ backlog: number }>(
        `
          select count(*)::int as backlog
          from integrations.dead_letters
          where status in ('queued', 'retry')
        `
      );
      const backlog = Number(rows[0]?.backlog ?? 0);
      return {
        backlog,
        backlogThreshold,
        healthy: backlog <= backlogThreshold
      };
    } catch {
      return {
        backlog: Number.POSITIVE_INFINITY,
        backlogThreshold,
        healthy: false
      };
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

    const appliedRows = await this.query<{ id: string; checksum: string }>(
      `select id, checksum from ${this.migrationsTable}`
    );
    const appliedChecksumById = new Map(appliedRows.map((row) => [row.id, row.checksum]));

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const checksum = computeMigrationSqlChecksum(sql);
      const previous = appliedChecksumById.get(file);

      assertAppliedMigrationUnchanged(previous, sql);
      if (previous !== undefined) {
        continue;
      }

      await this.withTransaction(async (client) => {
        await client.query(sql);
        await client.query(`insert into ${this.migrationsTable} (id, checksum) values ($1, $2)`, [
          file,
          checksum
        ]);
      });

      appliedChecksumById.set(file, checksum);
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
