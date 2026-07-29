import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { IdentityPolicyScope } from './identity-policy.js';
import type {
  IdentityPolicyRepository,
  IdentityPolicyRow,
  SaveIdentityPolicyInput
} from './identity-policy.repository.js';

interface Row {
  id: string;
  tenant_id: string;
  scope: IdentityPolicyScope;
  scope_id: string | null;
  level: number;
  require_photo_before_exam: boolean;
  updated_at: string;
}

const COLUMNS = 'id, tenant_id, scope, scope_id, level, require_photo_before_exam, updated_at';

function toRow(row: Row): IdentityPolicyRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    level: Number(row.level),
    requirePhotoBeforeExam: row.require_photo_before_exam,
    updatedAt: row.updated_at,
    ...(row.scope_id ? { scopeId: row.scope_id } : {})
  };
}

@Injectable()
export class PostgresIdentityPolicyRepository implements IdentityPolicyRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<IdentityPolicyRow[]> {
    const rows = await this.db.query<Row>(
      `select ${COLUMNS} from learning.identity_policies where tenant_id = $1`,
      [tenantId]
    );
    return rows.map(toRow);
  }

  async save(tenantId: string, input: SaveIdentityPolicyInput): Promise<IdentityPolicyRow> {
    const rows = await this.db.query<Row>(
      `insert into learning.identity_policies
         (id, tenant_id, scope, scope_id, level, require_photo_before_exam, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       -- Уникальность по (tenant, scope, scope_id): повторное сохранение той же области
       -- обновляет запись, а не заводит вторую с конфликтующим уровнем.
       on conflict (tenant_id, scope, coalesce(scope_id, '')) do update set
         level = excluded.level,
         require_photo_before_exam = excluded.require_photo_before_exam,
         updated_at = now()
       returning ${COLUMNS}`,
      [
        `ipol_${randomUUID()}`,
        tenantId,
        input.scope,
        input.scopeId ?? null,
        input.level,
        input.requirePhotoBeforeExam
      ]
    );
    return toRow(rows[0]!);
  }

  async remove(tenantId: string, scope: IdentityPolicyScope, scopeId?: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `delete from learning.identity_policies
       where tenant_id = $1 and scope = $2 and coalesce(scope_id, '') = coalesce($3, '')
       returning id`,
      [tenantId, scope, scopeId ?? null]
    );
    return rows.length > 0;
  }
}
