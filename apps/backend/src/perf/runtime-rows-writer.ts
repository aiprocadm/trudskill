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
 * Повторный запуск не задваивает: в одной транзакции удаляются строки ТОЛЬКО этого тенанта и
 * ТОЛЬКО заливаемых коллекций, потом вставка пачками. Чужие тенанты и остальные коллекции не
 * трогаются.
 */
import type { RuntimeRow } from './synthetic-cdoprof-tenant.js';

/** Минимум от `pg.PoolClient`, чтобы тест подставил заглушку. */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
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

export const writeRuntimeRows = async (
  client: SqlClient,
  tenantId: string,
  rows: ReadonlyArray<RuntimeRow>,
  options: WriteRuntimeRowsOptions = {}
): Promise<WriteRuntimeRowsResult> => {
  const batchSize = Math.max(1, options.batchSize ?? 1000);
  const table = options.table ?? RUNTIME_DOCUMENTS_TABLE;
  const collections = [...new Set(rows.map((row) => row.collection))].sort();

  await client.query('begin');
  try {
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

    await client.query('commit');
    return { deletedCollections: collections, inserted: rows.length, batches };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
};
