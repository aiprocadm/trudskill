import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { ConsentTextRepository, ConsentTextRow } from './consent-text.repository.js';
import type { ConsentKind } from './consent.js';

interface Row {
  tenant_id: string;
  kind: ConsentKind;
  version: number;
  body: string;
  body_hash: string;
  created_at: string;
}

const toRow = (r: Row): ConsentTextRow => ({
  tenantId: r.tenant_id,
  kind: r.kind,
  version: Number(r.version),
  body: r.body,
  bodyHash: r.body_hash,
  createdAt: r.created_at
});

@Injectable()
export class PostgresConsentTextRepository implements ConsentTextRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findCurrent(tenantId: string, kind: ConsentKind): Promise<ConsentTextRow | null> {
    const rows = await this.db.query<Row>(
      `select tenant_id, kind, version, body, body_hash, created_at
       from learning.consent_texts
       where tenant_id = $1 and kind = $2
       order by version desc limit 1`,
      [tenantId, kind]
    );
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async insert(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentTextRow> {
    // Новая версия = max + 1 одним запросом: старые строки не трогаем, по ним уже
    // дали согласие, и переписать их значило бы подменить доказательство.
    const rows = await this.db.query<Row>(
      `insert into learning.consent_texts (tenant_id, kind, version, body, body_hash)
       values (
         $1,
         $2,
         coalesce((select max(version) from learning.consent_texts where tenant_id = $1 and kind = $2), 0) + 1,
         $3,
         $4
       )
       returning tenant_id, kind, version, body, body_hash, created_at`,
      [tenantId, kind, body, bodyHash]
    );
    return toRow(rows[0]!);
  }
}
