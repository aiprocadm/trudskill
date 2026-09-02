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
  /**
   * Механизмом ни разу не пользовались: в таблице нет НИ ОДНОЙ строки.
   *
   * Нужно, чтобы «очередь пуста, потому что всё доставлено» не выглядело так же, как
   * «очередь пуста, потому что доставки нет вовсе». В `core.outbox_events` сегодня не пишет
   * никто (решение записано в журнале 273), и зелёный сигнал о доставке читался эксплуатантом
   * как «события уходят исправно» (журнал 329). Признак вычисляется по данным: появится
   * первая строка — он исчезнет сам, без правки кода.
   */
  unused: boolean;
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
      // Недоступность и ЕСТЬ ответ: проверка живости для того и вызывается.
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
      /*
       * Считаем по РЕАЛЬНОМУ источнику (Фаза 6 Task 5).
       *
       * Раньше здесь была таблица `integrations.sync_jobs` со статусом `retry`, и это
       * было двойное расхождение с действительностью: приложение в эту таблицу никогда
       * не пишет (задачи живут снимком в `documents.runtime_documents`), а статуса
       * `retry` нет даже в её CHECK-ограничении. Проверка всегда возвращала ноль,
       * то есть готовность не покраснела бы и при полностью забитой очереди.
       */
      const rows = await this.query<{ backlog: number; lag_seconds: number | null }>(
        `
          select
            count(*)::int as backlog,
            coalesce(extract(epoch from now() - min((data->>'createdAt')::timestamptz)), 0)::int
              as lag_seconds
          from documents.runtime_documents
          where collection = 'tasks'
            and data->>'status' in ('queued', 'running')
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
      /*
       * Тоже реальный источник (Фаза 6 Task 5): `core.outbox_events` — это и есть
       * outbox, с ним работает OutboxPublisherService. Прежний запрос смотрел в
       * `integrations.dead_letters` со статусами `queued`/`retry`, которых нет в её
       * CHECK-ограничении, — то есть измерял не то и всегда возвращал ноль.
       */
      const rows = await this.query<{ backlog: number }>(
        `
          select count(*)::int as backlog
          from core.outbox_events
          where status in ('pending', 'failed')
        `
      );
      const backlog = Number(rows[0]?.backlog ?? 0);
      const totals = await this.query<{ total: number }>(
        'select count(*)::int as total from core.outbox_events'
      );
      return {
        backlog,
        backlogThreshold,
        healthy: backlog <= backlogThreshold,
        unused: Number(totals[0]?.total ?? 0) === 0
      };
    } catch {
      return {
        backlog: Number.POSITIVE_INFINITY,
        backlogThreshold,
        healthy: false,
        // Сбой запроса — это НЕ «механизмом не пользуются»: сказать про него нечего,
        // и выдавать «не используется» значило бы объяснять поломку удобной причиной.
        unused: false
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

  /**
   * Ключ блокировки миграций. Число произвольное, но постоянное: важно лишь, чтобы все
   * экземпляры бэкенда брали ОДИН и тот же ключ.
   */
  private static readonly MIGRATIONS_LOCK_KEY = 528_501;

  /**
   * Накатывание миграций под блокировкой (Фаза 6 Task 9).
   *
   * ЗАЧЕМ. Раньше миграции шли без всякой блокировки. При одновременном старте двух
   * экземпляров (перевыкатка, `docker compose up --scale`, перезапуск после сбоя) оба
   * читали список применённых, оба видели одну и ту же новую миграцию и оба начинали её
   * применять. В лучшем случае второй падал на «таблица уже существует» и контейнер уходил
   * в цикл перезапусков; в худшем — миграция без `IF NOT EXISTS` обрывалась на середине.
   *
   * `pg_advisory_lock` — блокировка уровня СЕАНСА (не транзакции): её держит один
   * выделенный клиент, пока идут все миграции. Второй экземпляр на этой строке просто
   * ждёт, а дождавшись — видит, что применять уже нечего.
   */
  async runMigrations(): Promise<void> {
    const lockClient = await this.getPool().connect();
    try {
      await lockClient.query('select pg_advisory_lock($1)', [DatabaseService.MIGRATIONS_LOCK_KEY]);
      await this.runMigrationsUnderLock();
    } finally {
      // Снять блокировку обязательно, иначе следующий старт будет ждать вечно.
      try {
        await lockClient.query('select pg_advisory_unlock($1)', [
          DatabaseService.MIGRATIONS_LOCK_KEY
        ]);
      } finally {
        lockClient.release();
      }
    }
  }

  private async runMigrationsUnderLock(): Promise<void> {
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
