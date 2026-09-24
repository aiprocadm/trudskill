import { Inject, Injectable } from '@nestjs/common';

import {
  COMMON_SORT_COLUMNS,
  type LookupItem,
  type RegistryListPage,
  likePattern,
  parseRegistryListQuery
} from './registry-list-query.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';
import {
  LEGACY_GROUP_STATUS,
  isoWeekBounds,
  normalizeGroupStatus,
  parseGroupFilter
} from '../../groups/group-status.js';

import type { GroupListQuery, GroupsRepository } from './groups.repository.js';
import type { BaseFilterQuery } from '../../mvp.dto.js';
import type { GroupEntity } from '../../mvp.types.js';

/** Белый список сортировок групп: общие поля плюс контрагент и даты. */
export const GROUP_SORT_COLUMNS: Record<string, string> = {
  ...COMMON_SORT_COLUMNS,
  counterpartyId: 'counterparty_id',
  startDate: 'starts_at',
  endDate: 'ends_at',
  examDate: 'exam_date'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, code, name, status, counterparty_id, external_id, ' +
  'source_system, legacy_number, starts_at, ends_at, exam_date, exam_access_from, exam_access_to, ' +
  'materials_access_until, practice_from, practice_to, study_form, is_dot, education_form_at_ppo, ' +
  'access_mode, enrollment_mode, remote_signature, require_identity, responsible_user_id, comment, ' +
  'learner_message, notify_on_pass, closed_at, archived_at, payload';

/**
 * Параметры списка групп из строки запроса: общие (`page/page_size/sort/q`), скоуп портала и
 * отборы МГ-B3.2 (`status` — один или несколько, `quick`, `responsible_id`, периоды дат,
 * `include_archived`); `today` — календарная дата в поясе центра для быстрых отборов.
 */
export function parseGroupListQuery(
  query: BaseFilterQuery,
  today: string,
  scope?: { counterpartyId?: string }
): GroupListQuery {
  const base = parseRegistryListQuery(query, GROUP_SORT_COLUMNS, scope);
  delete base.status;
  return { ...base, ...parseGroupFilter(query as Record<string, unknown>), today };
}

/** Канонический статус и его старые синонимы — для `status = any(...)`. */
const statusSynonyms = (canonical: string): string[] => [
  canonical,
  ...Object.entries(LEGACY_GROUP_STATUS)
    .filter(([, mapped]) => mapped === canonical)
    .map(([legacy]) => legacy)
];

/**
 * Учебные группы из `learning.groups` (Фаза 1, срез 1b). Скоуп портала — `counterparty_id = $n`:
 * группа без контрагента представителю не видна сама собой (NULL не равен ничему), ровно как в
 * правиле `scopeAllows` снимка.
 */
@Injectable()
export class PostgresGroupsRepository implements GroupsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: GroupListQuery): Promise<RegistryListPage<GroupEntity>> {
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from learning.groups where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.groups
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}${sort.direction === 'desc' ? ' nulls last' : ''}, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('groups', row) as unknown as GroupEntity),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<GroupEntity | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.groups where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('groups', rows[0]) as unknown as GroupEntity) : null;
  }

  async lookup(tenantId: string, query: GroupListQuery): Promise<RegistryListPage<LookupItem>> {
    const page = await this.list(tenantId, query);
    return {
      ...page,
      items: page.items.map((item) => ({ id: item.id, label: item.name, status: item.status }))
    };
  }

  /** Дополнительные условия к `where tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  private filters(tenantId: string, query: GroupListQuery): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    if (query.counterpartyId) push(query.counterpartyId, (p) => `counterparty_id = ${p}`);
    const statuses = (query.statuses ?? [])
      .map((s) => normalizeGroupStatus(s))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    if (statuses.length > 0) {
      push(statuses.flatMap(statusSynonyms), (p) => `status = any(${p}::text[])`);
    }
    if (query.responsibleUserId) push(query.responsibleUserId, (p) => `responsible_user_id = ${p}`);
    if (query.startFrom) push(query.startFrom, (p) => `starts_at::date >= ${p}::date`);
    if (query.startTo) push(query.startTo, (p) => `starts_at::date <= ${p}::date`);
    if (query.endFrom) push(query.endFrom, (p) => `ends_at::date >= ${p}::date`);
    if (query.endTo) push(query.endTo, (p) => `ends_at::date <= ${p}::date`);
    if (query.examFrom) push(query.examFrom, (p) => `exam_date >= ${p}::date`);
    if (query.examTo) push(query.examTo, (p) => `exam_date <= ${p}::date`);
    // Быстрые отборы (МГ-B3.2) — та же семантика, что у `filterGroups` снимка.
    const notArchivedOrCancelled = `status not in ('archived', 'cancelled')`;
    switch (query.quick) {
      case 'learning':
        push(statusSynonyms('in_progress'), (p) => `status = any(${p}::text[])`);
        break;
      case 'exam_this_week': {
        const week = isoWeekBounds(query.today);
        push(week.from, (p) => `exam_date >= ${p}::date`);
        push(week.to, (p) => `exam_date <= ${p}::date`);
        conditions.push(notArchivedOrCancelled);
        break;
      }
      case 'awaiting_documents':
        conditions.push(`status = 'documents'`);
        break;
      case 'ended_without_documents':
        push(query.today, (p) => `ends_at::date < ${p}::date`);
        push(
          [...statusSynonyms('in_progress'), 'exam', 'documents'],
          (p) => `status = any(${p}::text[])`
        );
        break;
      case 'ends_today':
        push(query.today, (p) => `ends_at::date = ${p}::date`);
        conditions.push(notArchivedOrCancelled);
        break;
      case 'archive':
        conditions.push(`status = 'archived'`);
        break;
      default:
        break;
    }
    const wantsArchive =
      query.includeArchived || query.quick === 'archive' || statuses.includes('archived');
    if (!wantsArchive) conditions.push(`status <> 'archived'`);
    if (query.q) {
      params.push(likePattern(query.q));
      const p = `$${params.length}`;
      conditions.push(
        `(code ilike ${p} or name ilike ${p} or coalesce(legacy_number, '') ilike ${p} or coalesce(comment, '') ilike ${p} or payload::text ilike ${p})`
      );
    }
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
