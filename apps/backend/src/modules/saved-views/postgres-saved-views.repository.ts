import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  SavedViewInsert,
  SavedViewRecord,
  SavedViewScope,
  SavedViewsRepository
} from './saved-views.repository.js';

interface Row {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  entity: string;
  name: string;
  scope: SavedViewScope;
  filters: Record<string, string> | null;
  columns: string[] | null;
  sort: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : String(value);

const toRecord = (row: Row): SavedViewRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  ownerUserId: row.owner_user_id,
  entity: row.entity,
  name: row.name,
  scope: row.scope,
  filters: row.filters ?? {},
  columns: row.columns ?? [],
  ...(row.sort ? { sort: row.sort } : {}),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const COLUMNS =
  'id, tenant_id, owner_user_id, entity, name, scope, filters, columns, sort, created_at, updated_at';

@Injectable()
export class PostgresSavedViewsRepository implements SavedViewsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listFor(tenantId: string, entity: string, userId: string): Promise<SavedViewRecord[]> {
    const rows = await this.db.query<Row>(
      `select ${COLUMNS} from reports.saved_views
        where tenant_id = $1 and entity = $2 and deleted_at is null
          and (owner_user_id = $3 or scope = 'tenant')
        order by scope desc, name asc, id asc`,
      [tenantId, entity, userId]
    );
    return rows.map(toRecord);
  }

  async get(tenantId: string, id: string): Promise<SavedViewRecord | null> {
    const rows = await this.db.query<Row>(
      `select ${COLUMNS} from reports.saved_views where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, id]
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async insert(record: SavedViewInsert): Promise<SavedViewRecord> {
    const id = `sv_${Math.random().toString(36).slice(2, 12)}`;
    const rows = await this.db.query<Row>(
      `insert into reports.saved_views (id, tenant_id, owner_user_id, entity, name, scope, filters, columns, sort)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       returning ${COLUMNS}`,
      [
        id,
        record.tenantId,
        record.ownerUserId,
        record.entity,
        record.name,
        record.scope,
        JSON.stringify(record.filters),
        JSON.stringify(record.columns),
        record.sort ?? null
      ]
    );
    return toRecord(rows[0]!);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `update reports.saved_views set deleted_at = now(), updated_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null
        returning id`,
      [tenantId, id]
    );
    return rows.length > 0;
  }
}
