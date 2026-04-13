import { Injectable } from '@nestjs/common';

import {
  DOCUMENTS_ARRAY_COLLECTIONS,
  type DocumentsArrayCollection
} from './documents-collections.js';
import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';
import type { PoolClient } from 'pg';

const IDEM_COLLECTION = 'idem';
const IDEM_ROW_ID = '_';

@Injectable()
export class PostgresDocumentsPersistenceBackend implements DocumentsPersistenceBackend {
  constructor(private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      const rows = await this.db.query<{ data: unknown }>(
        `select data from documents.runtime_documents where tenant_id = $1 and collection = $2`,
        [tenantId, col]
      );
      for (const row of rows) target.push(row.data);
    }
    state.idem.clear();
    const idemRows = await this.db.query<{
      data: { entries?: [string, { taskId: string; expiresAt: number }][] };
    }>(
      `select data from documents.runtime_documents where tenant_id = $1 and collection = $2 and id = $3`,
      [tenantId, IDEM_COLLECTION, IDEM_ROW_ID]
    );
    const entries = idemRows[0]?.data?.entries;
    if (entries?.length) {
      for (const [k, v] of entries) state.idem.set(k, v);
    }
  }

  async saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
        await client.query(
          `delete from documents.runtime_documents where tenant_id = $1 and collection = $2`,
          [tenantId, col]
        );
        const items = this.pick(state, col) as Array<{ id: string; tenantId: string }>;
        for (const entity of items) {
          await client.query(
            `insert into documents.runtime_documents (tenant_id, collection, id, data, created_at, updated_at)
             values ($1, $2, $3, $4::jsonb, now(), now())`,
            [tenantId, col, entity.id, JSON.stringify(entity)]
          );
        }
      }
      await client.query(
        `delete from documents.runtime_documents where tenant_id = $1 and collection = $2`,
        [tenantId, IDEM_COLLECTION]
      );
      const idemPayload = { entries: Array.from(state.idem.entries()) };
      await client.query(
        `insert into documents.runtime_documents (tenant_id, collection, id, data, created_at, updated_at)
         values ($1, $2, $3, $4::jsonb, now(), now())`,
        [tenantId, IDEM_COLLECTION, IDEM_ROW_ID, JSON.stringify(idemPayload)]
      );
    });
  }

  private pick(state: InMemoryDocumentsState, col: DocumentsArrayCollection): unknown[] {
    return (state as unknown as Record<DocumentsArrayCollection, unknown[]>)[col];
  }
}
