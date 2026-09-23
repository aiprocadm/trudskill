/**
 * Запись синтетических строк в снимок тенанта `learning.mvp_runtime_documents` — стендовая
 * оснастка спайка производительности (ТЗ перехода с CDOPROF, §15.1 МГ-A3.1).
 *
 * Почему мимо приложения. Прежняя оснастка (`infra/load/seed-load-tenant.sh`) заливала 500
 * слушателей обычным импортом — «тем же кодом, что в бою». Для 25 000 групп этот путь
 * занял бы часы: каждая группа — отдельный запрос, а каждый запрос переписывает снимок. Спайк
 * меряет ЧТЕНИЕ, поэтому форма строк повторяет то, что пишет `PostgresMvpPersistenceBackend`
 * (те же колонки, тот же JSON), а путь записи — прямой.
 *
 * Повторный запуск не задваивает: в одной транзакции (`withTransaction` — единственный способ
 * репозитория, сторож `multi-write-is-atomic`) удаляются строки ТОЛЬКО этого тенанта и ТОЛЬКО
 * заливаемых коллекций, потом вставка пачками. Чужие тенанты и остальные коллекции не трогаются.
 */
import type { RuntimeRow } from './synthetic-cdoprof-tenant.js';
import type { Pool } from 'pg';

/** Минимум от `pg.PoolClient`, чтобы тест подставил заглушку. */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Минимум от `DatabaseService`: транзакция как единственный способ сделать несколько записей. */
export interface TransactionRunner {
  withTransaction<T>(callback: (client: SqlClient) => Promise<T>): Promise<T>;
}

export interface WriteRuntimeRowsOptions {
  batchSize?: number;
  table?: string;
}

export interface WriteRuntimeRowsResult {
  deletedCollections: string[];
  inserted: number;
  batches: number;
}

export const RUNTIME_DOCUMENTS_TABLE = 'learning.mvp_runtime_documents';

export const writeRuntimeRows = (
  db: TransactionRunner,
  tenantId: string,
  rows: ReadonlyArray<RuntimeRow>,
  options: WriteRuntimeRowsOptions = {}
): Promise<WriteRuntimeRowsResult> => {
  const batchSize = Math.max(1, options.batchSize ?? 1000);
  const table = options.table ?? RUNTIME_DOCUMENTS_TABLE;
  const collections = [...new Set(rows.map((row) => row.collection))].sort();

  return db.withTransaction(async (client) => {
    await client.query(`delete from ${table} where tenant_id = $1 and collection = any($2)`, [
      tenantId,
      collections
    ]);

    let batches = 0;
    for (let start = 0; start < rows.length; start += batchSize) {
      const chunk = rows.slice(start, start + batchSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 4;
        values.push(tenantId, row.collection, row.id, JSON.stringify(row.data));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, now(), now())`;
      });
      await client.query(
        `insert into ${table} (tenant_id, collection, id, data, created_at, updated_at) values ${placeholders.join(', ')}`,
        values
      );
      batches += 1;
    }

    return { deletedCollections: collections, inserted: rows.length, batches };
  });
};

/**
 * Транзакция поверх голого `pg.Pool` — для скрипта, у которого нет Nest и `DatabaseService`.
 * Та же семантика: commit при успехе, rollback и проброс при ошибке, соединение возвращается.
 */
export const poolTransactions = (pool: Pool): TransactionRunner => ({
  async withTransaction<T>(callback: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
});
