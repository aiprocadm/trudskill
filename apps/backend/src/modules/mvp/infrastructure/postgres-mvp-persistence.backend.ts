import { Injectable, Logger } from '@nestjs/common';

import { MVP_COLLECTIONS, type MvpCollection } from './mvp-collections.js';
import { backendEnv } from '../../../env.js';
import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';
import type { PoolClient } from 'pg';

const LEGACY_TABLE = 'learning.mvp_runtime_documents';
const NORMALIZED_TABLE = 'learning.mvp_stage1_runtime_documents';
const RECONCILIATION_TABLE = 'learning.mvp_reconciliation_log';

@Injectable()
export class PostgresMvpPersistenceBackend implements MvpPersistenceBackend {
  private readonly logger = new Logger(PostgresMvpPersistenceBackend.name);

  constructor(private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    const readModel = backendEnv.LMS_READ_MODEL;

    if (readModel === 'normalized') {
      await this.loadModelIntoState(tenantId, state, NORMALIZED_TABLE);
      return;
    }

    if (readModel === 'shadow') {
      const [legacySnapshot, normalizedSnapshot] = await Promise.all([
        this.readSnapshot(tenantId, LEGACY_TABLE),
        this.readSnapshot(tenantId, NORMALIZED_TABLE)
      ]);
      this.applySnapshot(state, legacySnapshot);
      await this.reconcileRead(tenantId, legacySnapshot, normalizedSnapshot);
      return;
    }

    await this.loadModelIntoState(tenantId, state, LEGACY_TABLE);
  }

  async saveFromState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    if (!backendEnv.LMS_DUAL_WRITE_ENABLED) {
      await this.writeLegacy(tenantId, state);
      return;
    }

    await this.writeNormalized(tenantId, state);
    try {
      await this.writeLegacy(tenantId, state);
    } catch (error) {
      this.logger.error(
        `Legacy write failed after normalized write for tenant=${tenantId}; running compensation`,
        error instanceof Error ? error.stack : undefined
      );

      await this.logReconciliationIssue(tenantId, {
        issueType: 'dual_write_partial_failure',
        collection: 'all',
        entityId: null,
        details: {
          phase: 'legacy_write',
          message: this.stringifyError(error)
        }
      });

      try {
        await this.compensateNormalizedWrite(tenantId);
      } catch (compensationError) {
        this.logger.error(
          `Compensation failed for tenant=${tenantId}`,
          compensationError instanceof Error ? compensationError.stack : undefined
        );
        await this.logReconciliationIssue(tenantId, {
          issueType: 'dual_write_compensation_failed',
          collection: 'all',
          entityId: null,
          details: {
            message: this.stringifyError(compensationError)
          }
        });
      }

      throw error;
    }
  }

  async writeLegacy(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.writeSnapshotToTable(tenantId, state, LEGACY_TABLE);
  }

  async writeNormalized(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.writeSnapshotToTable(tenantId, state, NORMALIZED_TABLE);
  }

  private async loadModelIntoState(
    tenantId: string,
    state: InMemoryMvpState,
    tableName: string
  ): Promise<void> {
    const snapshot = await this.readSnapshot(tenantId, tableName);
    this.applySnapshot(state, snapshot);
  }

  private async readSnapshot(
    tenantId: string,
    tableName: string
  ): Promise<Record<MvpCollection, unknown[]>> {
    const snapshot = {} as Record<MvpCollection, unknown[]>;

    for (const col of MVP_COLLECTIONS) {
      const rows = await this.db.query<{ data: unknown }>(
        `select data from ${tableName} where tenant_id = $1 and collection = $2`,
        [tenantId, col]
      );
      snapshot[col] = rows.map((row) => row.data);
    }

    return snapshot;
  }

  private applySnapshot(state: InMemoryMvpState, snapshot: Record<MvpCollection, unknown[]>): void {
    for (const col of MVP_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      target.push(...(snapshot[col] ?? []));
    }
  }

  private async writeSnapshotToTable(
    tenantId: string,
    state: InMemoryMvpState,
    tableName: string
  ): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      for (const col of MVP_COLLECTIONS) {
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
    });
  }

  private async compensateNormalizedWrite(tenantId: string): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(`delete from ${NORMALIZED_TABLE} where tenant_id = $1`, [tenantId]);
    });
  }

  private async reconcileRead(
    tenantId: string,
    legacy: Record<MvpCollection, unknown[]>,
    normalized: Record<MvpCollection, unknown[]>
  ): Promise<void> {
    for (const col of MVP_COLLECTIONS) {
      const legacyItems = legacy[col] ?? [];
      const normalizedItems = normalized[col] ?? [];
      const legacyById = new Map(
        legacyItems
          .map((item) => [this.extractEntityId(item), item] as const)
          .filter(([id]) => Boolean(id))
      );
      const normalizedById = new Map(
        normalizedItems
          .map((item) => [this.extractEntityId(item), item] as const)
          .filter(([id]) => Boolean(id))
      );

      const allIds = new Set([...legacyById.keys(), ...normalizedById.keys()]);
      for (const entityId of allIds) {
        const legacyEntity = legacyById.get(entityId);
        const normalizedEntity = normalizedById.get(entityId);
        const mismatch = this.compareKeyFields(legacyEntity, normalizedEntity);
        if (mismatch.length === 0) continue;

        await this.logReconciliationIssue(tenantId, {
          issueType: 'shadow_read_mismatch',
          collection: col,
          entityId,
          details: mismatch
        });
      }
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

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private pick(state: InMemoryMvpState, col: MvpCollection): unknown[] {
    return (state as unknown as Record<MvpCollection, unknown[]>)[col];
  }
}
