import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { MVP_COLLECTIONS, type MvpCollection } from './mvp-collections.js';
import { MvpWriteOrchestrator } from './mvp-write.orchestrator.js';
import { backendEnv } from '../../../env.js';
import {
  decryptLearnerPiiAtRest,
  encryptLearnerPiiAtRest
} from '../../../infrastructure/crypto/pii-crypto.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';
import type { PoolClient } from 'pg';

const LEGACY_TABLE = 'learning.mvp_runtime_documents';
const NORMALIZED_TABLE = 'learning.mvp_stage1_runtime_documents';
const RECONCILIATION_TABLE = 'learning.mvp_reconciliation_log';

@Injectable()
export class PostgresMvpPersistenceBackend implements MvpPersistenceBackend {
  private readonly logger = new Logger(PostgresMvpPersistenceBackend.name);
  private readonly writeOrchestrator = new MvpWriteOrchestrator(this.logger);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

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
    /*
     * Чтение не должно ничего писать (Фаза 6 Task 10).
     *
     * Состояние центра сохранялось в конце КАЖДОГО запроса — включая обычный показ списка.
     * При 500 слушателях это «удалить всё и вставить заново» на каждый клик: замер дал
     * p95 = 30 секунд при требовании §12 в 300 мс. Если отпечаток совпал с тем, что
     * загрузили, менять в базе нечего.
     */
    if (state.loadedFingerprint !== null && this.fingerprint(state) === state.loadedFingerprint) {
      return;
    }

    await this.writeOrchestrator.persist({
      tenantId,
      state,
      dualWriteEnabled: backendEnv.LMS_DUAL_WRITE_ENABLED,
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
      // ФТ-C3.3: ПДн слушателей зашифрованы at-rest — в память кладём открытые значения,
      // остальной рантайм (реестры/ЕСИА/поиск) шифрования не видит.
      snapshot[col] =
        col === 'learners'
          ? rows.map((row) => decryptLearnerPiiAtRest(row.data))
          : rows.map((row) => row.data);
    }

    return snapshot;
  }

  private applySnapshot(state: InMemoryMvpState, snapshot: Record<MvpCollection, unknown[]>): void {
    for (const col of MVP_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      target.push(...(snapshot[col] ?? []));
    }
    // Запоминаем, каким состояние пришло: в конце запроса сравним и не будем писать зря.
    state.loadedFingerprint = this.fingerprint(state);
  }

  /**
   * Отпечаток состояния (Фаза 6 Task 10).
   *
   * Считается по ОТКРЫТЫМ значениям в памяти, а не по тому, что лежит в базе: шифрование
   * ПДн при записи даёт каждый раз разный шифртекст, и сравнивать его было бы бессмысленно.
   */
  private fingerprint(state: InMemoryMvpState): string {
    const hash = createHash('sha1');
    for (const col of MVP_COLLECTIONS) {
      hash.update(col);
      hash.update(JSON.stringify(this.pick(state, col)));
    }
    return hash.digest('hex');
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
        /*
         * Вставка ПАЧКАМИ (Фаза 6 Task 10). Раньше на каждую сущность уходил отдельный
         * запрос: у центра с 500 слушателями это больше тысячи обращений к базе на одно
         * сохранение. Значения те же, обращений — в сотни раз меньше.
         */
        const CHUNK = 500;
        for (let start = 0; start < items.length; start += CHUNK) {
          const chunk = items.slice(start, start + CHUNK);
          const values: unknown[] = [];
          const placeholders: string[] = [];
          chunk.forEach((entity, index) => {
            // ФТ-C3.3: снилс — только шифртекстом + слепой индекс; legacy-plaintext строки
            // перешифровываются здесь же при сохранении состояния тенанта.
            const atRest = col === 'learners' ? encryptLearnerPiiAtRest(entity) : entity;
            const base = index * 4;
            placeholders.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, now(), now())`
            );
            values.push(tenantId, col, entity.id, JSON.stringify(atRest));
          });
          if (placeholders.length === 0) {
            continue;
          }
          await client.query(
            `insert into ${tableName} (tenant_id, collection, id, data, created_at, updated_at)
             values ${placeholders.join(', ')}`,
            values
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
  private pick(state: InMemoryMvpState, col: MvpCollection): unknown[] {
    return (state as unknown as Record<MvpCollection, unknown[]>)[col];
  }
}
