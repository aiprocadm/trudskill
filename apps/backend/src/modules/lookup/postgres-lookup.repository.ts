import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { CodeNameRow, LookupRepository, PositionRow } from './lookup.repository.js';

interface PositionDbRow {
  id: string;
  tenant_id: string;
  name: string;
  is_active: boolean;
}

interface CodeNameDbRow {
  code: string;
  name: string;
  sort_order: number | string;
  is_active: boolean;
}

@Injectable()
export class PostgresLookupRepository implements LookupRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listPositions(tenantId: string, q: string, limit: number): Promise<PositionRow[]> {
    const params: unknown[] = [tenantId, limit];
    const filter = q.trim() ? `and p.name ilike $3` : '';
    if (q.trim()) params.push(`%${q.trim()}%`);
    const rows = await this.db.query<PositionDbRow>(
      `select p.id, p.tenant_id, p.name, p.is_active
         from lookup.positions p
        where p.tenant_id = $1 and p.is_active ${filter}
        order by lower(p.name)
        limit $2`,
      params
    );
    return rows.map(toPosition);
  }

  /**
   * Одна запись на пачку (сторож «две записи без транзакции»): недостающие имена
   * докладываются через `unnest`, совпадения без учёта регистра пропускаются индексом.
   */
  async rememberPositions(tenantId: string, names: ReadonlyArray<string>): Promise<number> {
    if (names.length === 0) return 0;
    const ids = names.map(() => `pos_${randomUUID().replace(/-/g, '')}`);
    const rows = await this.db.query<{ id: string }>(
      `insert into lookup.positions (id, tenant_id, name)
       select n.id, $1, n.name
         from unnest($2::text[], $3::text[]) as n(id, name)
       on conflict (tenant_id, lower(name)) do nothing
       returning id`,
      [tenantId, ids, [...names]]
    );
    return rows.length;
  }

  async listEducationLevels(): Promise<CodeNameRow[]> {
    const rows = await this.db.query<CodeNameDbRow>(
      `select code, name, sort_order, is_active
         from lookup.education_levels
        where is_active
        order by sort_order, code`
    );
    return rows.map(toCodeName);
  }

  async listCountries(): Promise<CodeNameRow[]> {
    const rows = await this.db.query<CodeNameDbRow>(
      `select code, name, sort_order, is_active
         from lookup.countries
        where is_active
        order by sort_order, name`
    );
    return rows.map(toCodeName);
  }
}

const toPosition = (row: PositionDbRow): PositionRow => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  isActive: row.is_active
});

const toCodeName = (row: CodeNameDbRow): CodeNameRow => ({
  code: row.code,
  name: row.name,
  sortOrder: Number(row.sort_order),
  isActive: row.is_active
});
