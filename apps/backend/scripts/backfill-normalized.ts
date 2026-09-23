import { Pool } from 'pg';

import { BackfillService } from '../src/modules/migration/backfill/backfill.service.js';
import { NormalizedBackfillService } from '../src/modules/migration/backfill/normalized/normalized-backfill.service.js';

import type { DatabaseService } from '../src/infrastructure/database/database.service.js';
import type { PoolClient } from 'pg';

/**
 * Бэкфилл «JSON-снимок → нормализованные таблицы» из командной строки (Фаза 1 ТЗ перехода с
 * CDOPROF, срезы 0b–1b). То же, что `POST /migration/backfill/runs/start` с доменом
 * `lms_normalized`, но без HTTP и общего секрета: удобно на стенде и в runbook владельца.
 *
 *   DATABASE_URL=postgresql://… pnpm --filter @trudskill/backend backfill:normalized [--batch 500]
 *
 * Снимок не меняется; таблицы можно очистить и прогнать заново. Отказы строк — поимённо в
 * `migration.backfill_items` и в отчёте, который печатается в конце. В боевом контуре запуск
 * через этот скрипт запрещён — там бэкфилл идёт ручкой под секретом, а сама миграция данных
 * (МГ-K5.1) — только по runbook владельца.
 */

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('backfill-normalized: в боевом контуре запуск из командной строки запрещён');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('backfill-normalized: нужна переменная DATABASE_URL');
  const batchArg = process.argv.indexOf('--batch');
  const batchSize = batchArg >= 0 ? Number(process.argv[batchArg + 1]) : 500;

  const pool = new Pool({ connectionString: url, max: 4 });
  const db = {
    query: async <T>(sql: string, params: unknown[] = [], client?: PoolClient) =>
      (await (client ?? pool).query(sql, params)).rows as T[],
    withTransaction: async <T>(cb: (client: PoolClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await cb(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  } as unknown as DatabaseService;

  try {
    const service = new BackfillService(db, new NormalizedBackfillService(db));
    const started = Date.now();
    const { run, processed, completed } = await service.createAndRun('lms_normalized', batchSize);
    const { report } = await service.getReport(run.id);
    const failed =
      report?.missingOrMismatchedRecords.filter((r) => r.reason === 'missing_in_target') ?? [];
    console.log(
      JSON.stringify(
        {
          runId: run.id,
          status: run.status,
          completed,
          processed,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          counts: report?.counts ?? [],
          failed: failed.map((r) => ({
            tenant: r.tenant_id,
            collection: r.collection,
            id: r.id,
            error: r.error
          }))
        },
        null,
        2
      )
    );
    if (!completed) process.exitCode = 2;
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
