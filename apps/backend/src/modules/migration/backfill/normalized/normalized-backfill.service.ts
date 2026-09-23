import { Inject, Injectable } from '@nestjs/common';

import {
  HOT_COLLECTIONS,
  type HotCollection,
  type ProjectionContext,
  TABLE_SPECS,
  type TableSpec,
  canonicalHash,
  emptyContext,
  projectEntity
} from './normalized-projection.js';
import { loadCounterpartyIds, upsertRow } from './normalized-upsert.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';

import type {
  BackfillRunRecord,
  ReconciliationCount,
  ReconciliationMismatch,
  ReconciliationReport,
  ReconciliationStatusDistribution
} from '../backfill.types.js';
import type { PoolClient } from 'pg';

/**
 * Домен `lms_normalized` дозаполнения (ТЗ перехода с CDOPROF, Фаза 1, срез 0b — МГ-A1.2):
 * горячие коллекции JSON-снимка → нормализованные таблицы 0104–0110.
 *
 * Отличия от доменов «JSON → JSON» (`BackfillService`):
 *   • источников два (снимок центра и снимок документов), целей восемь — прогон идёт по
 *     коллекциям в порядке `HOT_COLLECTIONS`, который уважает внешние ключи (контрагенты
 *     раньше групп, группы раньше зачислений, зачисления раньше документов); чекпоинт —
 *     `(collection, tenant_id, id)`;
 *   • частичный успех: каждая строка пишется в своей точке сохранения; отказ базы (FK,
 *     UNIQUE, CHECK) или проекции (нет обязательного поля) ложится в `backfill_items`
 *     со статусом `failed` и текстом ошибки, а прогон идёт дальше. Иначе одна плохая
 *     строка из 60 000 останавливала бы всё, и повтор падал бы на том же месте;
 *   • хэши источника и цели сравнимы: оба считаются `canonicalHash` от одной проекции —
 *     источник по спроецированным колонкам, цель по перечитанной строке.
 *
 * Снимок сервис не меняет: таблицы-цели можно очистить и прогнать заново (upsert по `id`).
 * Статусы прогона, ручки и хранение отчёта остаются в `BackfillService`.
 */

export const NORMALIZED_DOMAIN = 'lms_normalized' as const;

/** Первая пачка коллекции: ключ «меньше любого» для `(tenant_id, id) > ($2, $3)`. */
const START_KEY = '';
const ERROR_TEXT_LIMIT = 500;

type SnapshotRow = { tenant_id: string; id: string; data: unknown };

@Injectable()
export class NormalizedBackfillService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Одна пачка текущей коллекции. Пустая выборка — переход к следующей коллекции; после
   * последней — `completed`. Возвращает, сколько строк записано и сколько отказано.
   */
  async processBatch(
    run: BackfillRunRecord
  ): Promise<{ processed: number; failed: number; completed: boolean }> {
    const collection = this.currentCollection(run);
    if (!collection) return { processed: 0, failed: 0, completed: true };

    const spec = TABLE_SPECS[collection];
    const rows = await this.loadBatch(spec, run, collection);
    if (rows.length === 0) {
      const next = HOT_COLLECTIONS[HOT_COLLECTIONS.indexOf(collection) + 1];
      await this.db.query(
        `update migration.backfill_runs
            set checkpoint_collection = $2, checkpoint_tenant_id = $3, checkpoint_id = $4, updated_at = now()
          where id = $1`,
        [run.id, next ?? collection, START_KEY, START_KEY]
      );
      return { processed: 0, failed: 0, completed: next === undefined };
    }

    let failed = 0;
    await this.db.withTransaction(async (client) => {
      const byTenant = new Map<string, SnapshotRow[]>();
      for (const row of rows) {
        const list = byTenant.get(row.tenant_id) ?? [];
        list.push(row);
        byTenant.set(row.tenant_id, list);
      }
      for (const [tenantId, tenantRows] of byTenant) {
        const ctx = await this.loadContext(client, collection, tenantId, tenantRows);
        for (const row of tenantRows) {
          const ok = await this.writeRow(client, run, spec, collection, row, ctx);
          if (!ok) failed += 1;
        }
      }
      const last = rows[rows.length - 1]!;
      await client.query(
        `update migration.backfill_runs
            set checkpoint_collection = $2, checkpoint_tenant_id = $3, checkpoint_id = $4,
                processed_count = processed_count + $5, updated_at = now()
          where id = $1`,
        [run.id, collection, last.tenant_id, last.id, rows.length]
      );
    });

    return { processed: rows.length - failed, failed, completed: false };
  }

  /** Отчёт сверки: счётчики и статусы по (центр, коллекция), отказы и расхождения хэшей. */
  async buildReport(run: BackfillRunRecord): Promise<ReconciliationReport> {
    const counts: ReconciliationCount[] = [];
    const statusDistributions: ReconciliationStatusDistribution[] = [];

    for (const collection of HOT_COLLECTIONS) {
      const spec = TABLE_SPECS[collection];
      const partition = await this.db.query<ReconciliationCount>(
        `with src as (
           select tenant_id, count(*)::int as source_count
             from ${spec.source}
            where collection = $1
            group by tenant_id
         ),
         tgt as (
           select tenant_id, count(*)::int as target_count
             from ${spec.table}
            group by tenant_id
         )
         select coalesce(s.tenant_id, t.tenant_id) as tenant_id,
                $2::text as collection,
                coalesce(s.source_count, 0)::int as source_count,
                coalesce(t.target_count, 0)::int as target_count
           from src s
           full join tgt t using (tenant_id)
          order by 1`,
        [collection, collection]
      );
      counts.push(...partition);

      const statuses = await this.db.query<ReconciliationStatusDistribution>(
        `with src as (
           select tenant_id, coalesce(data->>'status', '__null__') as status, count(*)::int as source_status_count
             from ${spec.source}
            where collection = $1
            group by tenant_id, 2
         ),
         tgt as (
           select tenant_id, coalesce(status, '__null__') as status, count(*)::int as target_status_count
             from ${spec.table}
            group by tenant_id, 2
         )
         select coalesce(s.tenant_id, t.tenant_id) as tenant_id,
                $2::text as collection,
                coalesce(s.status, t.status) as status,
                coalesce(s.source_status_count, 0)::int as source_status_count,
                coalesce(t.target_status_count, 0)::int as target_status_count
           from src s
           full join tgt t using (tenant_id, status)
          order by 1, 3`,
        [collection, collection]
      );
      statusDistributions.push(...statuses);
    }

    const items = await this.db.query<{
      tenant_id: string;
      collection: string;
      entity_id: string;
      source_hash: string | null;
      target_hash: string | null;
      status: string;
      error: string | null;
    }>(
      `select tenant_id, collection, entity_id, source_hash, target_hash, status, error
         from migration.backfill_items
        where run_id = $1 and (status = 'failed' or source_hash is distinct from target_hash)
        order by tenant_id, collection, entity_id`,
      [run.id]
    );
    const missingOrMismatchedRecords: ReconciliationMismatch[] = items.map((item) => ({
      tenant_id: item.tenant_id,
      collection: item.collection,
      id: item.entity_id,
      source_hash: item.source_hash,
      target_hash: item.target_hash,
      reason: item.status === 'failed' ? 'missing_in_target' : 'hash_mismatch',
      ...(item.error ? { error: item.error } : {})
    }));

    return {
      generatedAt: new Date().toISOString(),
      runId: run.id,
      domain: NORMALIZED_DOMAIN,
      summary: {
        totalCountPartitions: counts.length,
        totalStatusPartitions: statusDistributions.length,
        totalMismatches: missingOrMismatchedRecords.length
      },
      counts,
      statusDistributions,
      missingOrMismatchedRecords
    };
  }

  private currentCollection(run: BackfillRunRecord): HotCollection | undefined {
    if (!run.checkpoint_collection) return HOT_COLLECTIONS[0];
    const known = HOT_COLLECTIONS.find((c) => c === run.checkpoint_collection);
    if (!known) {
      throw new Error(
        `Чекпоинт прогона указывает на неизвестную коллекцию: ${run.checkpoint_collection}`
      );
    }
    return known;
  }

  private loadBatch(
    spec: TableSpec,
    run: BackfillRunRecord,
    collection: HotCollection
  ): Promise<SnapshotRow[]> {
    const afterTenant =
      run.checkpoint_collection === collection
        ? (run.checkpoint_tenant_id ?? START_KEY)
        : START_KEY;
    const afterId =
      run.checkpoint_collection === collection ? (run.checkpoint_id ?? START_KEY) : START_KEY;
    return this.db.query<SnapshotRow>(
      `select tenant_id, id, data
         from ${spec.source}
        where collection = $1 and (tenant_id, id) > ($2::text, $3::text)
        order by tenant_id asc, id asc
        limit $4`,
      [collection, afterTenant, afterId, Math.max(1, run.batch_size)]
    );
  }

  /** Соседи строк одного центра одним запросом на таблицу — только то, что нужно коллекции. */
  private async loadContext(
    client: PoolClient,
    collection: HotCollection,
    tenantId: string,
    rows: SnapshotRow[]
  ): Promise<ProjectionContext> {
    const ctx = emptyContext();
    const field = (name: string): string[] => [
      ...new Set(
        rows
          .map((r) => (r.data as Record<string, unknown>)?.[name])
          .filter((v): v is string => typeof v === 'string' && v !== '')
      )
    ];

    if (collection === 'learners') {
      const ids = field('linkedIamUserId');
      if (ids.length > 0) {
        const users = await client.query<{ id: string }>(
          'select id from iam.users where tenant_id = $1 and id = any($2::text[])',
          [tenantId, ids]
        );
        for (const u of users.rows) ctx.users.add(u.id);
      }
    }
    if (collection === 'groups') {
      ctx.counterparties = await loadCounterpartyIds(client, tenantId, field('counterpartyId'));
    }
    if (collection === 'generatedDocuments') {
      const enrollmentIds = rows
        .map((r) => r.data as Record<string, unknown>)
        .filter((d) => d?.sourceEntityType === 'enrollment' && typeof d.sourceEntityId === 'string')
        .map((d) => d.sourceEntityId as string);
      const groupIds = new Set(
        rows
          .map((r) => r.data as Record<string, unknown>)
          .filter((d) => d?.sourceEntityType === 'group' && typeof d.sourceEntityId === 'string')
          .map((d) => d.sourceEntityId as string)
      );
      if (enrollmentIds.length > 0) {
        const found = await client.query<{ id: string; group_id: string; learner_id: string }>(
          'select id, group_id, learner_id from learning.enrollments where tenant_id = $1 and id = any($2::text[])',
          [tenantId, enrollmentIds]
        );
        for (const e of found.rows) {
          ctx.enrollments.set(e.id, { groupId: e.group_id, learnerId: e.learner_id });
          groupIds.add(e.group_id);
        }
      }
      if (groupIds.size > 0) {
        const found = await client.query<{ id: string; counterparty_id: string | null }>(
          'select id, counterparty_id from learning.groups where tenant_id = $1 and id = any($2::text[])',
          [tenantId, [...groupIds]]
        );
        for (const g of found.rows) ctx.groups.set(g.id, { counterpartyId: g.counterparty_id });
      }
      const fileIds = field('fileId');
      if (fileIds.length > 0) {
        const found = await client.query<{ id: string }>(
          'select id from storage.files where tenant_id = $1 and id = any($2::text[])',
          [tenantId, fileIds]
        );
        for (const f of found.rows) ctx.files.add(f.id);
      }
    }
    return ctx;
  }

  /** Одна строка в своей точке сохранения. `true` — записана, `false` — отказ зафиксирован. */
  private async writeRow(
    client: PoolClient,
    run: BackfillRunRecord,
    spec: TableSpec,
    collection: HotCollection,
    row: SnapshotRow,
    ctx: ProjectionContext
  ): Promise<boolean> {
    await client.query('savepoint backfill_row');
    try {
      const projected = projectEntity(collection, row.tenant_id, row.data, ctx);
      const sourceHash = canonicalHash(spec, projected.columns);
      await upsertRow(client, spec, projected);
      const targetHash = await this.readBackHash(client, spec, row.tenant_id, row.id);
      await this.recordItem(
        client,
        run,
        collection,
        row,
        'processed',
        sourceHash,
        targetHash,
        null
      );
      await client.query('release savepoint backfill_row');
      return true;
    } catch (error) {
      await client.query('rollback to savepoint backfill_row');
      await this.recordItem(
        client,
        run,
        collection,
        row,
        'failed',
        null,
        null,
        this.errorText(error)
      );
      await client.query('release savepoint backfill_row');
      return false;
    }
  }

  private async readBackHash(
    client: PoolClient,
    spec: TableSpec,
    tenantId: string,
    id: string
  ): Promise<string> {
    const names = Object.keys(spec.columns);
    const result = await client.query<Record<string, unknown>>(
      `select ${names.join(', ')} from ${spec.table} where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    const row = result.rows[0];
    if (!row) throw new Error('строка не найдена после записи');
    return canonicalHash(spec, row);
  }

  private async recordItem(
    client: PoolClient,
    run: BackfillRunRecord,
    collection: HotCollection,
    row: SnapshotRow,
    status: 'processed' | 'failed',
    sourceHash: string | null,
    targetHash: string | null,
    error: string | null
  ): Promise<void> {
    await client.query(
      `insert into migration.backfill_items
         (run_id, domain, tenant_id, collection, entity_id, source_hash, target_hash, status, error, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
       on conflict (run_id, domain, tenant_id, collection, entity_id)
       do update set source_hash = excluded.source_hash, target_hash = excluded.target_hash,
                     status = excluded.status, error = excluded.error, updated_at = now()`,
      [run.id, run.domain, row.tenant_id, collection, row.id, sourceHash, targetHash, status, error]
    );
  }

  private errorText(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.length > ERROR_TEXT_LIMIT ? `${text.slice(0, ERROR_TEXT_LIMIT)}…` : text;
  }
}
