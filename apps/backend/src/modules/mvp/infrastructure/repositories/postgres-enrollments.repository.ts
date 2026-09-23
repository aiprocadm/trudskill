import { Inject, Injectable } from '@nestjs/common';

import { type RegistryListPage, parseRegistryListQuery } from './registry-list-query.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';

import type { EnrollmentListQuery, EnrollmentsRepository } from './enrollments.repository.js';
import type { BaseFilterQuery } from '../../mvp.dto.js';
import type { Enrollment, EnrollmentStatusHistory } from '../../mvp.types.js';

/** Белый список сортировок зачислений. */
export const ENROLLMENT_SORT_COLUMNS: Record<string, string> = {
  id: 'id',
  status: 'status',
  enrolledAt: 'enrolled_at',
  completedAt: 'completed_at',
  plannedEndAt: 'planned_end_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, group_id, learner_id, status, enrolled_at, completed_at, ' +
  'planned_end_at, proctoring_override, external_id, source_system, payload';

const HISTORY_COLUMNS =
  'id, tenant_id, created_at, enrollment_id, status, changed_at, reason, payload';

const isoOrNull = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
};

/**
 * Параметры списка зачислений из строки запроса: общие (`page/page_size/sort/status`) плюс
 * фильтры, которые снимок реально применял к зачислениям (`group_id`, `learner_id`,
 * `created_from/to`, `planned_end_from/to`). `q` для зачислений не применяется (журнал 614:
 * в снимке он искал подстроку по JSON, чем никто не пользуется), остальные фильтры
 * `BaseFilterQuery` игнорируются — в снимке они давали пустой список.
 */
export function parseEnrollmentListQuery(
  query: BaseFilterQuery,
  learnerIds: string[] | null,
  scope?: { counterpartyId?: string }
): EnrollmentListQuery {
  const base = parseRegistryListQuery(query, ENROLLMENT_SORT_COLUMNS, scope);
  delete base.q;
  const result: EnrollmentListQuery = { ...base, learnerIds };
  if (typeof query.group_id === 'string' && query.group_id) result.groupId = query.group_id;
  if (typeof query.learner_id === 'string' && query.learner_id) result.learnerId = query.learner_id;
  const createdFrom = isoOrNull(query.created_from);
  const createdTo = isoOrNull(query.created_to);
  const plannedFrom = isoOrNull(query.planned_end_from);
  const plannedTo = isoOrNull(query.planned_end_to);
  if (createdFrom) result.createdFrom = createdFrom;
  if (createdTo) result.createdTo = createdTo;
  if (plannedFrom) result.plannedEndFrom = plannedFrom;
  if (plannedTo) result.plannedEndTo = plannedTo;
  return result;
}

/**
 * Зачисления из `learning.enrollments` (Фаза 1, срез 3b). Скоуп представителя заказчика — через
 * группы его контрагента (`exists` по `learning.groups`, индекс 0039); anti-IDOR — `learner_id`
 * из переданного списка. Порядок по умолчанию — `created_at asc, id asc`, как у остальных реестров.
 */
@Injectable()
export class PostgresEnrollmentsRepository implements EnrollmentsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: EnrollmentListQuery): Promise<RegistryListPage<Enrollment>> {
    if (query.learnerIds !== null && query.learnerIds.length === 0) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    }
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from learning.enrollments e where e.tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.enrollments e
        where e.tenant_id = $1 ${extra}
        order by e.${sort.column} ${sort.direction}, e.id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('enrollments', row) as unknown as Enrollment),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<Enrollment | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.enrollments e where e.tenant_id = $1 and e.id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('enrollments', rows[0]) as unknown as Enrollment) : null;
  }

  async history(tenantId: string, enrollmentId: string): Promise<EnrollmentStatusHistory[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${HISTORY_COLUMNS} from learning.enrollment_status_history
        where tenant_id = $1 and enrollment_id = $2
        order by changed_at asc, id asc`,
      [tenantId, enrollmentId]
    );
    return rows.map(
      (row) => rowToEntity('enrollmentStatusHistory', row) as unknown as EnrollmentStatusHistory
    );
  }

  /** Дополнительные условия к `where e.tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  private filters(
    tenantId: string,
    query: EnrollmentListQuery
  ): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    if (query.learnerIds !== null)
      push(query.learnerIds, (p) => `e.learner_id = any(${p}::text[])`);
    if (query.counterpartyId) {
      push(
        query.counterpartyId,
        (p) =>
          `exists (select 1 from learning.groups g where g.tenant_id = e.tenant_id and g.id = e.group_id and g.counterparty_id = ${p})`
      );
    }
    if (query.status) push(query.status, (p) => `e.status = ${p}`);
    if (query.groupId) push(query.groupId, (p) => `e.group_id = ${p}`);
    if (query.learnerId) push(query.learnerId, (p) => `e.learner_id = ${p}`);
    if (query.createdFrom) push(query.createdFrom, (p) => `e.created_at >= ${p}::timestamptz`);
    if (query.createdTo) push(query.createdTo, (p) => `e.created_at <= ${p}::timestamptz`);
    if (query.plannedEndFrom)
      push(query.plannedEndFrom, (p) => `e.planned_end_at >= ${p}::timestamptz`);
    if (query.plannedEndTo)
      push(query.plannedEndTo, (p) => `e.planned_end_at <= ${p}::timestamptz`);
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
