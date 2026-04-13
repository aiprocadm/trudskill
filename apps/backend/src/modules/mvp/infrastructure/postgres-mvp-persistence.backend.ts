import { Injectable } from '@nestjs/common';

import { MVP_COLLECTIONS, type MvpCollection } from './mvp-collections.js';
import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';
import type { PoolClient } from 'pg';

@Injectable()
export class PostgresMvpPersistenceBackend implements MvpPersistenceBackend {
  constructor(private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    for (const col of MVP_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      const rows = await this.db.query<{ data: unknown }>(
        `select data from learning.mvp_runtime_documents where tenant_id = $1 and collection = $2`,
        [tenantId, col]
      );
      for (const row of rows) target.push(row.data);
    }
  }

  async saveFromState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      for (const col of MVP_COLLECTIONS) {
        await client.query(
          `delete from learning.mvp_runtime_documents where tenant_id = $1 and collection = $2`,
          [tenantId, col]
        );
        const items = this.pick(state, col) as Array<{ id: string; tenantId: string }>;
        for (const entity of items) {
          await client.query(
            `insert into learning.mvp_runtime_documents (tenant_id, collection, id, data, created_at, updated_at)
             values ($1, $2, $3, $4::jsonb, now(), now())`,
            [tenantId, col, entity.id, JSON.stringify(entity)]
          );
        }
      }
    });
  }

  private pick(state: InMemoryMvpState, col: MvpCollection): unknown[] {
    return (state as unknown as Record<MvpCollection, unknown[]>)[col];
  }
}
