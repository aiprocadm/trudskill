import { Injectable, Logger } from '@nestjs/common';

import {
  DOCUMENTS_ARRAY_COLLECTIONS,
  type DocumentsArrayCollection
} from './documents-collections.js';
import { DocumentsWriteOrchestrator } from './documents-write.orchestrator.js';
import { backendEnv } from '../../../env.js';
import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';
import type { PoolClient } from 'pg';

const IDEM_COLLECTION = 'idem';
const IDEM_ROW_ID = '_';
const LEGACY_TABLE = 'documents.runtime_documents';
const NORMALIZED_TABLE = 'documents.stage1_runtime_documents';
const RECONCILIATION_TABLE = 'documents.reconciliation_log';

type DocumentsSnapshot = {
  arrays: Record<DocumentsArrayCollection, unknown[]>;
  idemEntries: [string, { taskId: string; expiresAt: number }][];
};

@Injectable()
export class PostgresDocumentsPersistenceBackend implements DocumentsPersistenceBackend {
  private readonly logger = new Logger(PostgresDocumentsPersistenceBackend.name);
  private readonly writeOrchestrator = new DocumentsWriteOrchestrator(this.logger);

  constructor(private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    const readModel = backendEnv.DOCUMENTS_READ_MODEL;

    if (readModel === 'normalized') {
      const normalized = await this.readSnapshot(tenantId, NORMALIZED_TABLE);
      this.applySnapshot(state, normalized);
      return;
    }

    if (readModel === 'shadow') {
      const [legacy, normalized] = await Promise.all([
        this.readSnapshot(tenantId, LEGACY_TABLE),
        this.readSnapshot(tenantId, NORMALIZED_TABLE)
      ]);
      this.applySnapshot(state, legacy);
      await this.reconcileRead(tenantId, legacy, normalized);
      return;
    }

    const legacy = await this.readSnapshot(tenantId, LEGACY_TABLE);
    this.applySnapshot(state, legacy);
  }

  async saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.writeOrchestrator.persist({
      tenantId,
      state,
      dualWriteEnabled: backendEnv.DOCUMENTS_DUAL_WRITE_ENABLED,
      writeLegacy: (currentTenantId, currentState) =>
        this.writeLegacy(currentTenantId, currentState),
      writeNormalized: (currentTenantId, currentState) =>
        this.writeNormalized(currentTenantId, currentState),
      compensateNormalizedWrite: (currentTenantId) =>
        this.compensateNormalizedWrite(currentTenantId),
      logReconciliationIssue: (currentTenantId, payload) =>
        this.logReconciliationIssue(currentTenantId, payload)
    });
  }

  async writeLegacy(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.writeSnapshot(tenantId, state, LEGACY_TABLE);
  }

  async writeNormalized(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.writeSnapshot(tenantId, state, NORMALIZED_TABLE);
  }

  private async readSnapshot(tenantId: string, tableName: string): Promise<DocumentsSnapshot> {
    const arrays = {} as Record<DocumentsArrayCollection, unknown[]>;
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const rows = await this.db.query<{ data: unknown }>(
        `select data from ${tableName} where tenant_id = $1 and collection = $2`,
        [tenantId, col]
      );
      arrays[col] = rows.map((row) => row.data);
    }

    const idemRows = await this.db.query<{
      data: { entries?: [string, { taskId: string; expiresAt: number }][] };
    }>(`select data from ${tableName} where tenant_id = $1 and collection = $2 and id = $3`, [
      tenantId,
      IDEM_COLLECTION,
      IDEM_ROW_ID
    ]);

    return {
      arrays,
      idemEntries: idemRows[0]?.data?.entries ?? []
    };
  }

  private applySnapshot(state: InMemoryDocumentsState, snapshot: DocumentsSnapshot): void {
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      target.push(...(snapshot.arrays[col] ?? []));
    }

    state.idem.clear();
    for (const [k, v] of snapshot.idemEntries) state.idem.set(k, v);
  }

  private async writeSnapshot(
    tenantId: string,
    state: InMemoryDocumentsState,
    tableName: string
  ): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
        await client.query(`delete from ${tableName} where tenant_id = $1 and collection = $2`, [
          tenantId,
          col
        ]);
        const items = this.pick(state, col) as Array<{ id: string; tenantId: string }>;
        for (const entity of items) {
          await client.query(
            `insert into ${tableName} (tenant_id, collection, id, data, created_at, updated_at)
             values ($1, $2, $3, $4::jsonb, now(), now())`,
            [tenantId, col, entity.id, JSON.stringify(entity)]
          );
        }
      }

      await client.query(`delete from ${tableName} where tenant_id = $1 and collection = $2`, [
        tenantId,
        IDEM_COLLECTION
      ]);
      const idemPayload = { entries: Array.from(state.idem.entries()) };
      await client.query(
        `insert into ${tableName} (tenant_id, collection, id, data, created_at, updated_at)
         values ($1, $2, $3, $4::jsonb, now(), now())`,
        [tenantId, IDEM_COLLECTION, IDEM_ROW_ID, JSON.stringify(idemPayload)]
      );
    });
  }

  private async compensateNormalizedWrite(tenantId: string): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(`delete from ${NORMALIZED_TABLE} where tenant_id = $1`, [tenantId]);
    });
  }

  private async reconcileRead(
    tenantId: string,
    legacy: DocumentsSnapshot,
    normalized: DocumentsSnapshot
  ): Promise<void> {
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const legacyById = new Map(
        legacy.arrays[col]
          .map((item) => [this.extractEntityId(item), item] as const)
          .filter(([id]) => Boolean(id))
      );
      const normalizedById = new Map(
        normalized.arrays[col]
          .map((item) => [this.extractEntityId(item), item] as const)
          .filter(([id]) => Boolean(id))
      );

      const allIds = new Set([...legacyById.keys(), ...normalizedById.keys()]);
      for (const entityId of allIds) {
        const mismatch = this.compareKeyFields(
          legacyById.get(entityId),
          normalizedById.get(entityId)
        );
        if (mismatch.length === 0) continue;

        await this.logReconciliationIssue(tenantId, {
          issueType: 'shadow_read_mismatch',
          collection: col,
          entityId,
          details: mismatch
        });
      }
    }

    if (JSON.stringify(legacy.idemEntries) !== JSON.stringify(normalized.idemEntries)) {
      await this.logReconciliationIssue(tenantId, {
        issueType: 'shadow_read_mismatch',
        collection: IDEM_COLLECTION,
        entityId: IDEM_ROW_ID,
        details: ['idemEntries']
      });
    }
  }

  private compareKeyFields(legacyEntity: unknown, normalizedEntity: unknown): string[] {
    if (!legacyEntity || !normalizedEntity) {
      return ['entity_missing_in_one_model'];
    }

    const fields = ['id', 'tenantId', 'status', 'updatedAt'];
    const mismatch: string[] = [];

    for (const field of fields) {
      const legacyValue = this.extractField(legacyEntity, field);
      const normalizedValue = this.extractField(normalizedEntity, field);
      if (JSON.stringify(legacyValue) !== JSON.stringify(normalizedValue)) {
        mismatch.push(field);
      }
    }

    return mismatch;
  }

  private extractEntityId(entity: unknown): string {
    if (!entity || typeof entity !== 'object') return '';
    const id = (entity as { id?: unknown }).id;
    return typeof id === 'string' ? id : '';
  }

  private extractField(entity: unknown, field: string): unknown {
    if (!entity || typeof entity !== 'object') return null;
    return (entity as Record<string, unknown>)[field] ?? null;
  }

  private async logReconciliationIssue(
    tenantId: string,
    payload: {
      issueType: string;
      collection: string;
      entityId: string | null;
      details: unknown;
    }
  ): Promise<void> {
    await this.db.query(
      `insert into ${RECONCILIATION_TABLE}
       (tenant_id, issue_type, collection, entity_id, details, created_at, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, now(), now())`,
      [
        tenantId,
        payload.issueType,
        payload.collection,
        payload.entityId,
        JSON.stringify(payload.details)
      ]
    );
  }
  private pick(state: InMemoryDocumentsState, col: DocumentsArrayCollection): unknown[] {
    return (state as unknown as Record<DocumentsArrayCollection, unknown[]>)[col];
  }
}
