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

import type { CounterpartiesRepository } from './counterparties.repository.js';
import type { Counterparty } from '../../mvp.types.js';

/** Белый список сортировок контрагентов: общие поля плюс ИНН и юридическое название. */
export const COUNTERPARTY_SORT_COLUMNS: Record<string, string> = {
  ...COMMON_SORT_COLUMNS,
  inn: 'inn',
  legalName: 'legal_name'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, code, name, legal_name, inn, kpp, contact_email, ' +
  'contact_phone, legal_address, note, status, external_id, source_system, ' +
  // МГ-D1.1 (срез 13.1): реквизиты — колонки миграции 0106.
  'short_name, ogrn, okpo, okato, oktmo, okogu, okopf, okved, postal_address, actual_address, ' +
  'region, city, postal_code, fax, director_name, director_position, manager_user_id, ' +
  'contract_number, contract_date, payload';

/**
 * Контрагенты из `crm.counterparties` (Фаза 1, срез 1b). Каждый запрос — с `tenant_id`; список
 * страницей базы: `order by … , id asc limit/offset`, `total` отдельным `count(*)`, поиск `q` по
 * коду, названию, юрназванию, ИНН и `payload` (поля импорта) через `ilike` — на объёме CDOPROF
 * его держат триграммные индексы 0109.
 */
@Injectable()
export class PostgresCounterpartiesRepository implements CounterpartiesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<Counterparty>> {
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from crm.counterparties where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from crm.counterparties
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('counterparties', row) as unknown as Counterparty),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<Counterparty | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from crm.counterparties where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('counterparties', rows[0]) as unknown as Counterparty) : null;
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
      conditions.push(`id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.q) {
      params.push(likePattern(query.q));
      const p = `$${params.length}`;
      // МГ-D1.1: краткое название, номер договора и ОГРН переехали из payload в колонки 0106 —
      // поиск обязан видеть их там, иначе «найти по номеру договора» молча перестаёт работать.
      conditions.push(
        `(code ilike ${p} or name ilike ${p} or coalesce(legal_name, '') ilike ${p} or coalesce(inn, '') ilike ${p}` +
          ` or coalesce(short_name, '') ilike ${p} or coalesce(contract_number, '') ilike ${p} or coalesce(ogrn, '') ilike ${p}` +
          ` or payload::text ilike ${p})`
      );
    }
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
