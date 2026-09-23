import { Inject, Injectable } from '@nestjs/common';

import {
  COMMON_SORT_COLUMNS,
  type LookupItem,
  type RegistryListPage,
  type RegistryListQuery,
  likePattern
} from './registry-list-query.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';

import type { GroupsRepository } from './groups.repository.js';
import type { GroupEntity } from '../../mvp.types.js';

/** Белый список сортировок групп: общие поля плюс контрагент. */
export const GROUP_SORT_COLUMNS: Record<string, string> = {
  ...COMMON_SORT_COLUMNS,
  counterpartyId: 'counterparty_id'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, code, name, status, counterparty_id, external_id, ' +
  'source_system, legacy_number, payload';

/**
 * Учебные группы из `learning.groups` (Фаза 1, срез 1b). Скоуп портала — `counterparty_id = $n`:
 * группа без контрагента представителю не видна сама собой (NULL не равен ничему), ровно как в
 * правиле `scopeAllows` снимка.
 */
@Injectable()
export class PostgresGroupsRepository implements GroupsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<GroupEntity>> {
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from learning.groups where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.groups
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}, id asc
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

  async lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>> {
    const page = await this.list(tenantId, query);
    return {
      ...page,
      items: page.items.map((item) => ({ id: item.id, label: item.name, status: item.status }))
    };
  }

  /** Дополнительные условия к `where tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  private filters(
    tenantId: string,
    query: RegistryListQuery
  ): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    if (query.counterpartyId) {
      params.push(query.counterpartyId);
      conditions.push(`counterparty_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.q) {
      params.push(likePattern(query.q));
      const p = `$${params.length}`;
      conditions.push(
        `(code ilike ${p} or name ilike ${p} or coalesce(legacy_number, '') ilike ${p} or payload::text ilike ${p})`
      );
    }
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
