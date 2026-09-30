import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { UNCHANGED, emptyDomainStats } from './import.types.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  ImportRow,
  ImportRowAction,
  ImportRowPlan,
  ImportRun,
  ImportRunDomain,
  ImportRunStats,
  ImportRunStatus,
  ImportSource
} from './import.types.js';

/** Сколько строк вставлять одним запросом: 13 755 слушателей — это 28 запросов, а не 13 755. */
const INSERT_CHUNK = 500;

/**
 * Запуск, который не отмечался дольше этого, считается прерванным (сервер перезапускался
 * посреди переноса): иначе он навсегда запрещал бы новый запуск. Число — умолчание, не закон.
 */
export const DEFAULT_STALE_RUN_MS = 2 * 60 * 60 * 1000;

const STALE_TEXT =
  'Перенос прервался: сервер перезапускался посреди работы. Запустите «Повторить только ошибки» или новый перенос — уже перенесённое повтор найдёт и не задвоит.';

/** Названия типов в `legacy_ids`: как у источника и как у нас. */
const LEGACY_TYPES = {
  counterparties: { source: 'contragent', target: 'counterparty' },
  directions: { source: 'parent_course', target: 'direction' },
  courses: { source: 'course', target: 'course' },
  learners: { source: 'student', target: 'learner' },
  groups: { source: 'group', target: 'group' },
  group_courses: { source: 'group_course', target: 'group_course' }
} as const;

export interface RowsPage {
  items: ImportRow[];
  total: number;
}

/**
 * Запуски и строки импорта: `migration.import_runs` / `import_rows` (0100), без базы — память.
 * Каждое чтение и запись — по центру: таблицы общие для всех центров.
 */
@Injectable()
export class ImportRunsStore {
  private readonly runs = new Map<string, ImportRun[]>();
  private readonly rows = new Map<string, ImportRow[]>();

  private readonly legacy = new Map<string, string>();
  staleRunMs = DEFAULT_STALE_RUN_MS;

  constructor(@Optional() @Inject(DatabaseService) private readonly database?: DatabaseService) {}

  async createRun(input: {
    tenantId: string;
    source: ImportSource;
    domain: ImportRunDomain;
    dryRun: boolean;
    startedBy?: string;
    backgroundTaskId?: string;
    stats?: Partial<ImportRunStats>;
  }): Promise<ImportRun> {
    const now = new Date().toISOString();
    const run: ImportRun = {
      id: `imp_${randomUUID()}`,
      tenantId: input.tenantId,
      source: input.source,
      domain: input.domain,
      status: 'running',
      dryRun: input.dryRun,
      stats: { ...emptyDomainStats(), byDomain: {}, ...input.stats },
      ...(input.startedBy ? { startedBy: input.startedBy } : {}),
      ...(input.backgroundTaskId ? { backgroundTaskId: input.backgroundTaskId } : {}),
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };
    if (this.database) {
      await this.database.query(
        `insert into migration.import_runs
           (id, tenant_id, source, domain, status, dry_run, stats, started_by, background_task_id, started_at, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$10,$9::timestamptz,$9::timestamptz,$9::timestamptz)`,
        [
          run.id,
          run.tenantId,
          run.source,
          run.domain,
          run.status,
          run.dryRun,
          JSON.stringify(run.stats),
          run.startedBy ?? null,
          now,
          run.backgroundTaskId ?? null
        ]
      );
      return run;
    }
    const list = this.runs.get(run.tenantId) ?? [];
    list.unshift(run);
    this.runs.set(run.tenantId, list);
    return run;
  }

  async addRows(tenantId: string, runId: string, plans: readonly ImportRowPlan[]): Promise<void> {
    const now = new Date().toISOString();
    if (this.database) {
      for (let start = 0; start < plans.length; start += INSERT_CHUNK) {
        const chunk = plans.slice(start, start + INSERT_CHUNK);
        const params: unknown[] = [];
        const values = chunk.map((plan) => {
          const base = params.length;
          params.push(
            runId,
            tenantId,
            plan.domain,
            plan.sourceId,
            plan.targetId ?? null,
            plan.action,
            plan.errorCode ?? null,
            plan.errorText ?? null,
            JSON.stringify(plan.raw),
            now
          );
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9}::jsonb,$${base + 10}::timestamptz,$${base + 10}::timestamptz)`;
        });
        await this.database.query(
          `insert into migration.import_rows
             (run_id, tenant_id, domain, source_id, target_id, action, error_code, error_text, raw, created_at, updated_at)
           values ${values.join(',')}`,
          params
        );
      }
      return;
    }
    const list = this.rows.get(tenantId) ?? [];
    plans.forEach((plan, index) => {
      list.push({ ...plan, id: `${runId}:${list.length + index}`, runId, createdAt: now });
    });
    this.rows.set(tenantId, list);
  }

  async finishRun(
    tenantId: string,
    runId: string,
    outcome: {
      status: Extract<ImportRunStatus, 'succeeded' | 'partial' | 'failed'>;
      stats: ImportRunStats;
      errorText?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    if (this.database) {
      await this.database.query(
        `update migration.import_runs
            set status = $3, stats = $4::jsonb, error_text = $5,
                finished_at = $6::timestamptz, updated_at = $6::timestamptz
          where tenant_id = $1 and id = $2`,
        [
          tenantId,
          runId,
          outcome.status,
          JSON.stringify(outcome.stats),
          outcome.errorText ?? null,
          now
        ]
      );
      return;
    }
    const run = (this.runs.get(tenantId) ?? []).find((item) => item.id === runId);
    if (!run) return;
    run.status = outcome.status;
    run.stats = outcome.stats;
    if (outcome.errorText !== undefined) run.errorText = outcome.errorText;
    run.finishedAt = now;
    run.updatedAt = now;
  }

  async listRuns(tenantId: string, limit: number): Promise<ImportRun[]> {
    if (this.database) {
      const rows = await this.database.query<Record<string, unknown>>(
        `select * from migration.import_runs where tenant_id = $1 order by created_at desc limit $2`,
        [tenantId, limit]
      );
      return rows.map((row) => runFromRow(row));
    }
    return (this.runs.get(tenantId) ?? []).slice(0, limit);
  }

  async getRun(tenantId: string, runId: string): Promise<ImportRun | undefined> {
    if (this.database) {
      const rows = await this.database.query<Record<string, unknown>>(
        `select * from migration.import_runs where tenant_id = $1 and id = $2`,
        [tenantId, runId]
      );
      return rows[0] ? runFromRow(rows[0]) : undefined;
    }
    return (this.runs.get(tenantId) ?? []).find((item) => item.id === runId);
  }

  /**
   * Идёт ли уже перенос. Запуск, не отмечавшийся дольше `staleRunMs`, — прерванный: он
   * закрывается с причиной словами и новому запуску не мешает.
   */
  async hasRunning(tenantId: string, now: Date = new Date()): Promise<boolean> {
    const staleBefore = new Date(now.getTime() - this.staleRunMs).toISOString();
    if (this.database) {
      await this.database.query(
        `update migration.import_runs
            set status = 'failed', error_text = $3, finished_at = $4::timestamptz, updated_at = $4::timestamptz
          where tenant_id = $1 and status in ('queued','running') and updated_at < $2::timestamptz`,
        [tenantId, staleBefore, STALE_TEXT, now.toISOString()]
      );
      const rows = await this.database.query<{ id: string }>(
        `select id from migration.import_runs where tenant_id = $1 and status in ('queued','running') limit 1`,
        [tenantId]
      );
      return rows.length > 0;
    }
    let running = false;
    for (const run of this.runs.get(tenantId) ?? []) {
      if (run.status !== 'queued' && run.status !== 'running') continue;
      if (run.updatedAt < staleBefore) {
        run.status = 'failed';
        run.errorText = STALE_TEXT;
        run.finishedAt = now.toISOString();
        run.updatedAt = now.toISOString();
        continue;
      }
      running = true;
    }
    return running;
  }

  /** Перенос жив: отметка после каждой части, чтобы долгий запуск не сочли прерванным. */
  async touchRun(tenantId: string, runId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.database) {
      await this.database.query(
        `update migration.import_runs set updated_at = $3::timestamptz where tenant_id = $1 and id = $2`,
        [tenantId, runId, now]
      );
      return;
    }
    const run = (this.runs.get(tenantId) ?? []).find((item) => item.id === runId);
    if (run) run.updatedAt = now;
  }

  /**
   * Соответствие «запись CDOPROF → запись центра» (`migration.legacy_ids`, ТЗ §17): по нему
   * сверка и следующие домены (группы, зачисления) находят перенесённое. Пишутся строки с
   * адресатом — созданные, сопоставленные и «без изменений»; кандидаты на слияние — нет.
   */
  async saveLegacyIds(tenantId: string, rows: readonly ImportRowPlan[]): Promise<void> {
    const pairs = rows.filter(
      (row) =>
        row.targetId &&
        (row.action === 'created' || row.action === 'updated' || row.errorCode === UNCHANGED)
    );
    if (pairs.length === 0) return;
    const now = new Date().toISOString();
    if (this.database) {
      for (let start = 0; start < pairs.length; start += INSERT_CHUNK) {
        const chunk = pairs.slice(start, start + INSERT_CHUNK);
        const params: unknown[] = [];
        const values = chunk.map((row) => {
          const base = params.length;
          params.push(
            tenantId,
            LEGACY_TYPES[row.domain].source,
            row.sourceId,
            LEGACY_TYPES[row.domain].target,
            row.targetId,
            now
          );
          return `($${base + 1},'cdoprof',$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6}::timestamptz,$${base + 6}::timestamptz)`;
        });
        await this.database.query(
          `insert into migration.legacy_ids
             (tenant_id, source_system, source_type, source_id, target_type, target_id, created_at, updated_at)
           values ${values.join(',')}
           on conflict (tenant_id, source_system, source_type, source_id)
           do update set target_type = excluded.target_type, target_id = excluded.target_id, updated_at = excluded.updated_at`,
          params
        );
      }
      return;
    }
    for (const row of pairs) {
      this.legacy.set(
        `${tenantId}|${LEGACY_TYPES[row.domain].source}|${row.sourceId}`,
        row.targetId!
      );
    }
  }

  /** Для проверок без базы: куда указывает запись источника. */
  legacyTargetOf(
    tenantId: string,
    domain: ImportRowPlan['domain'],
    sourceId: string
  ): string | undefined {
    return this.legacy.get(`${tenantId}|${LEGACY_TYPES[domain].source}|${sourceId}`);
  }

  async listRows(
    tenantId: string,
    runId: string,
    query: { action?: ImportRowAction; errorCode?: string; limit: number; offset: number }
  ): Promise<RowsPage> {
    if (this.database) {
      const params: unknown[] = [tenantId, runId];
      let filters = '';
      if (query.action) {
        params.push(query.action);
        filters += ` and action = $${params.length}`;
      }
      if (query.errorCode) {
        params.push(query.errorCode);
        filters += ` and error_code = $${params.length}`;
      }
      const counted = await this.database.query<{ total: string }>(
        `select count(*)::text as total from migration.import_rows
          where tenant_id = $1 and run_id = $2${filters}`,
        params
      );
      const rows = await this.database.query<Record<string, unknown>>(
        `select * from migration.import_rows
          where tenant_id = $1 and run_id = $2${filters}
          order by id limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, query.limit, query.offset]
      );
      return { items: rows.map((row) => rowFromRow(row)), total: Number(counted[0]?.total ?? 0) };
    }
    const all = (this.rows.get(tenantId) ?? []).filter(
      (row) =>
        row.runId === runId &&
        (!query.action || row.action === query.action) &&
        (!query.errorCode || row.errorCode === query.errorCode)
    );
    return { items: all.slice(query.offset, query.offset + query.limit), total: all.length };
  }
}

const isoOf = (value: unknown): string | undefined =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : undefined;

const runFromRow = (row: Record<string, unknown>): ImportRun => {
  const startedAt = isoOf(row.started_at);
  const finishedAt = isoOf(row.finished_at);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    source: row.source as ImportRun['source'],
    domain: row.domain as ImportRun['domain'],
    status: row.status as ImportRun['status'],
    dryRun: row.dry_run === true,
    stats: (row.stats ?? { ...emptyDomainStats(), byDomain: {} }) as ImportRunStats,
    ...(row.started_by ? { startedBy: String(row.started_by) } : {}),
    ...(row.background_task_id ? { backgroundTaskId: String(row.background_task_id) } : {}),
    ...(row.error_text ? { errorText: String(row.error_text) } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    createdAt: isoOf(row.created_at) ?? '',
    updatedAt: isoOf(row.updated_at) ?? ''
  };
};

const rowFromRow = (row: Record<string, unknown>): ImportRow => ({
  id: String(row.id),
  runId: String(row.run_id),
  domain: row.domain as ImportRow['domain'],
  sourceId: String(row.source_id ?? ''),
  action: row.action as ImportRowAction,
  ...(row.target_id ? { targetId: String(row.target_id) } : {}),
  ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
  ...(row.error_text ? { errorText: String(row.error_text) } : {}),
  raw: (row.raw ?? {}) as Record<string, unknown>,
  createdAt: isoOf(row.created_at) ?? ''
});
