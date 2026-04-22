import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  BACKFILL_DOMAIN_TABLES,
  type BackfillDomain,
  type BackfillRunRecord
} from './backfill.types.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';

type RuntimeRow = {
  tenant_id: string;
  collection: string;
  id: string;
  data: unknown;
};

@Injectable()
export class BackfillService {
  constructor(private readonly db: DatabaseService) {}

  async createRun(domain: BackfillDomain, batchSize = 500): Promise<BackfillRunRecord> {
    const id = randomUUID();
    const [run] = await this.db.query<BackfillRunRecord>(
      `insert into migration.backfill_runs
       (id, domain, status, batch_size, started_at, created_at, updated_at)
       values ($1, $2, 'pending', $3, now(), now(), now())
       returning *`,
      [id, domain, Math.max(1, batchSize)]
    );

    if (!run) {
      throw new Error('Failed to create backfill run');
    }

    return run;
  }

  async processNextBatch(runId: string): Promise<{ processed: number; completed: boolean }> {
    const run = await this.getRunOrThrow(runId);
    const tables = BACKFILL_DOMAIN_TABLES[run.domain];

    await this.db.query(
      `update migration.backfill_runs set status = 'running', updated_at = now() where id = $1 and status in ('pending', 'running')`,
      [runId]
    );

    const rows = await this.loadBatch(tables.sourceTable, run, run.batch_size);
    if (rows.length === 0) {
      await this.db.query(
        `update migration.backfill_runs
         set status = 'completed', completed_at = now(), updated_at = now()
         where id = $1`,
        [runId]
      );
      await this.generateReport(runId);
      return { processed: 0, completed: true };
    }

    await this.db.withTransaction(async (client) => {
      for (const row of rows) {
        const sourceHash = this.hashBusinessPayload(row.data);
        await client.query(
          `insert into ${tables.targetTable} (tenant_id, collection, id, data, created_at, updated_at)
           values ($1, $2, $3, $4::jsonb, now(), now())
           on conflict (tenant_id, collection, id)
           do update set data = excluded.data, updated_at = now()`,
          [row.tenant_id, row.collection, row.id, JSON.stringify(row.data)]
        );

        const targetResult = await client.query<{ hash: string }>(
          `select md5(data::text) as hash
             from ${tables.targetTable}
            where tenant_id = $1 and collection = $2 and id = $3`,
          [row.tenant_id, row.collection, row.id]
        );
        const target = targetResult.rows[0];

        await client.query(
          `insert into migration.backfill_items
           (run_id, domain, tenant_id, collection, entity_id, source_hash, target_hash, status, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, 'processed', now(), now())
           on conflict (run_id, domain, tenant_id, collection, entity_id)
           do update set source_hash = excluded.source_hash,
                         target_hash = excluded.target_hash,
                         status = excluded.status,
                         updated_at = now()`,
          [
            run.id,
            run.domain,
            row.tenant_id,
            row.collection,
            row.id,
            sourceHash,
            target?.hash ?? null
          ]
        );
      }

      const last = rows[rows.length - 1]!;
      await client.query(
        `update migration.backfill_runs
         set checkpoint_tenant_id = $2,
             checkpoint_collection = $3,
             checkpoint_id = $4,
             processed_count = processed_count + $5,
             updated_at = now()
         where id = $1`,
        [runId, last.tenant_id, last.collection, last.id, rows.length]
      );
    });

    return { processed: rows.length, completed: false };
  }

  async getRun(runId: string): Promise<BackfillRunRecord | null> {
    const rows = await this.db.query<BackfillRunRecord>(
      'select * from migration.backfill_runs where id = $1',
      [runId]
    );
    return rows[0] ?? null;
  }

  async getItems(runId: string, limit = 200): Promise<unknown[]> {
    return this.db.query(
      `select *
         from migration.backfill_items
        where run_id = $1
        order by id desc
        limit $2`,
      [runId, Math.max(1, limit)]
    );
  }

  async getReport(
    runId: string
  ): Promise<{ run: BackfillRunRecord | null; report: unknown | null }> {
    const run = await this.getRun(runId);
    const reports = await this.db.query<{ report_json: unknown }>(
      'select report_json from migration.reconciliation_reports where run_id = $1',
      [runId]
    );
    return { run, report: reports[0]?.report_json ?? null };
  }

  async exportReport(
    runId: string,
    format: 'json' | 'csv'
  ): Promise<string | Record<string, unknown>> {
    const report = await this.getReport(runId);
    if (format === 'json') {
      return report as unknown as Record<string, unknown>;
    }

    const payload = (report.report ?? {}) as Record<string, unknown>;
    const counts = (payload.counts as Array<Record<string, unknown>> | undefined) ?? [];
    const dist = (payload.statusDistributions as Array<Record<string, unknown>> | undefined) ?? [];
    const mismatches =
      (payload.missingOrMismatchedRecords as Array<Record<string, unknown>> | undefined) ?? [];

    const lines: string[] = [];
    lines.push(
      'section,tenant_id,collection,status,source_count,target_count,source_status_count,target_status_count,id,reason,source_hash,target_hash'
    );

    for (const row of counts) {
      lines.push(
        [
          'counts',
          row.tenant_id,
          row.collection,
          '',
          row.source_count,
          row.target_count,
          '',
          '',
          '',
          '',
          '',
          ''
        ]
          .map((v) => this.csvValue(v))
          .join(',')
      );
    }

    for (const row of dist) {
      lines.push(
        [
          'status_distribution',
          row.tenant_id,
          row.collection,
          row.status,
          '',
          '',
          row.source_status_count,
          row.target_status_count,
          '',
          '',
          '',
          ''
        ]
          .map((v) => this.csvValue(v))
          .join(',')
      );
    }

    for (const row of mismatches) {
      lines.push(
        [
          'mismatch',
          row.tenant_id,
          row.collection,
          '',
          '',
          '',
          '',
          '',
          row.id,
          row.reason,
          row.source_hash,
          row.target_hash
        ]
          .map((v) => this.csvValue(v))
          .join(',')
      );
    }

    return lines.join('\n');
  }

  async listDiagnostics(limit = 20): Promise<unknown[]> {
    return this.db.query(
      `select r.*, rr.report_json
         from migration.backfill_runs r
         left join migration.reconciliation_reports rr on rr.run_id = r.id
        order by r.created_at desc
        limit $1`,
      [Math.max(1, limit)]
    );
  }

  private async generateReport(runId: string): Promise<void> {
    const run = await this.getRunOrThrow(runId);
    const tables = BACKFILL_DOMAIN_TABLES[run.domain];

    const counts = await this.db.query(
      `with source_counts as (
         select tenant_id, collection, count(*)::bigint as source_count
           from ${tables.sourceTable}
          group by tenant_id, collection
       ),
       target_counts as (
         select tenant_id, collection, count(*)::bigint as target_count
           from ${tables.targetTable}
          group by tenant_id, collection
       )
       select
         coalesce(s.tenant_id, t.tenant_id) as tenant_id,
         coalesce(s.collection, t.collection) as collection,
         coalesce(s.source_count, 0) as source_count,
         coalesce(t.target_count, 0) as target_count
       from source_counts s
       full join target_counts t using (tenant_id, collection)
       order by 1, 2`
    );

    const statusDistributions = await this.db.query(
      `with source_status as (
         select tenant_id, collection, coalesce(data->>'status', '__null__') as status, count(*)::bigint as source_status_count
           from ${tables.sourceTable}
          group by tenant_id, collection, coalesce(data->>'status', '__null__')
       ),
       target_status as (
         select tenant_id, collection, coalesce(data->>'status', '__null__') as status, count(*)::bigint as target_status_count
           from ${tables.targetTable}
          group by tenant_id, collection, coalesce(data->>'status', '__null__')
       )
       select
         coalesce(s.tenant_id, t.tenant_id) as tenant_id,
         coalesce(s.collection, t.collection) as collection,
         coalesce(s.status, t.status) as status,
         coalesce(s.source_status_count, 0) as source_status_count,
         coalesce(t.target_status_count, 0) as target_status_count
       from source_status s
       full join target_status t using (tenant_id, collection, status)
       order by 1, 2, 3`
    );

    const missingOrMismatchedRecords = await this.db.query(
      `with source_rows as (
         select tenant_id, collection, id, md5(data::text) as source_hash
           from ${tables.sourceTable}
       ),
       target_rows as (
         select tenant_id, collection, id, md5(data::text) as target_hash
           from ${tables.targetTable}
       )
       select
         coalesce(s.tenant_id, t.tenant_id) as tenant_id,
         coalesce(s.collection, t.collection) as collection,
         coalesce(s.id, t.id) as id,
         s.source_hash,
         t.target_hash,
         case
           when s.id is null then 'missing_in_source'
           when t.id is null then 'missing_in_target'
           when s.source_hash <> t.target_hash then 'hash_mismatch'
           else 'match'
         end as reason
       from source_rows s
       full join target_rows t using (tenant_id, collection, id)
       where s.id is null or t.id is null or s.source_hash <> t.target_hash
       order by 1, 2, 3`
    );

    const report = {
      generatedAt: new Date().toISOString(),
      runId,
      domain: run.domain,
      counts,
      statusDistributions,
      missingOrMismatchedRecords
    };

    await this.db.query(
      `insert into migration.reconciliation_reports
       (id, run_id, domain, report_json, created_at, updated_at)
       values ($1, $2, $3, $4::jsonb, now(), now())
       on conflict (run_id)
       do update set report_json = excluded.report_json,
                     domain = excluded.domain,
                     updated_at = now()`,
      [randomUUID(), runId, run.domain, JSON.stringify(report)]
    );
  }

  private async loadBatch(
    tableName: string,
    run: BackfillRunRecord,
    limit: number
  ): Promise<RuntimeRow[]> {
    const params: unknown[] = [];
    let where = '';

    if (run.checkpoint_tenant_id && run.checkpoint_collection && run.checkpoint_id) {
      params.push(run.checkpoint_tenant_id, run.checkpoint_collection, run.checkpoint_id);
      where = 'where (tenant_id, collection, id) > ($1::text, $2::text, $3::text)';
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    return this.db.query<RuntimeRow>(
      `select tenant_id, collection, id, data
         from ${tableName}
         ${where}
        order by tenant_id asc, collection asc, id asc
        limit ${limitParam}`,
      params
    );
  }

  private async getRunOrThrow(runId: string): Promise<BackfillRunRecord> {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Backfill run ${runId} not found`);
    }
    return run;
  }

  private hashBusinessPayload(payload: unknown): string {
    const normalized = this.sortJson(payload);
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  private sortJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortJson(item));
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b)
      );
      return entries.reduce<Record<string, unknown>>((acc, [key, nested]) => {
        acc[key] = this.sortJson(nested);
        return acc;
      }, {});
    }
    return value;
  }

  private csvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  }
}
