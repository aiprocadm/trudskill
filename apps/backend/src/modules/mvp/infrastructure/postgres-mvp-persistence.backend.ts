import { Inject, Injectable, Logger } from '@nestjs/common';

import { MVP_COLLECTIONS, type MvpCollection } from './mvp-collections.js';
import { MvpWriteOrchestrator } from './mvp-write.orchestrator.js';
import { backendEnv } from '../../../env.js';
import {
  ENCRYPTED_LEARNER_FIELDS,
  decryptLearnerPiiAtRest,
  encryptLearnerPiiAtRest,
  isEncryptedPiiValue
} from '../../../infrastructure/crypto/pii-crypto.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import {
  bumpTenantStateVersion,
  readTenantStateVersion
} from '../../../infrastructure/database/tenant-state-version.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';
import type { PoolClient } from 'pg';

const LEGACY_TABLE = 'learning.mvp_runtime_documents';
const NORMALIZED_TABLE = 'learning.mvp_stage1_runtime_documents';
const RECONCILIATION_TABLE = 'learning.mvp_reconciliation_log';

/**
 * Строка слушателя с ещё НЕ зашифрованными персональными данными. Такие остались от времён
 * до шифрования at-rest (ФТ-C3.3) и от времён, когда шифровался один лишь СНИЛС (до
 * 08.09.2026); перешифровываются при ближайшем сохранении состояния центра.
 *
 * Проверяются ВСЕ шифруемые поля, а не только СНИЛС: у карточки без СНИЛСа, но с почтой
 * прежняя проверка отвечала «всё в порядке» — и почта осталась бы открытым текстом навсегда,
 * потому что перешифровка запускается именно этим признаком.
 */
function hasLegacyPlaintextPii(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const learner = item as Record<string, unknown>;
  return ENCRYPTED_LEARNER_FIELDS.some((field) => {
    const value = learner[field];
    return typeof value === 'string' && value !== '' && !isEncryptedPiiValue(value);
  });
}

@Injectable()
export class PostgresMvpPersistenceBackend implements MvpPersistenceBackend {
  private readonly logger = new Logger(PostgresMvpPersistenceBackend.name);
  private readonly writeOrchestrator = new MvpWriteOrchestrator(this.logger);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    const readModel = backendEnv.LMS_READ_MODEL;
    // Версия снимка на момент чтения (журнал 272/292) — запись сверит её с текущей.
    state.stateVersionAtLoad = await readTenantStateVersion(
      (sql, params) => this.db.query<{ version: string | number }>(sql, params),
      tenantId,
      'mvp'
    );

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
     * Чтение не должно ничего писать (Фаза 6 Task 10, уточнено 2026-08-09).
     *
     * Состояние центра сохранялось в конце КАЖДОГО запроса — включая обычный показ списка.
     * При 500 слушателях это «удалить всё и вставить заново» на каждый клик. Теперь пишем
     * только те коллекции, к которым запрос обращался И которые действительно изменились;
     * если таких нет — не пишем вовсе.
     */
    if (state.touchedCollections().every((collection) => !state.hasChanged(collection))) {
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

  /**
   * Таблица, из которой читают. Только она сторожит версию снимка: `shadow` читает legacy,
   * поэтому legacy же и сторожит.
   */
  private authoritativeTable(): string {
    return backendEnv.LMS_READ_MODEL === 'normalized' ? NORMALIZED_TABLE : LEGACY_TABLE;
  }

  async writeLegacy(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.writeSnapshotToTable(tenantId, state, LEGACY_TABLE);
  }

  async writeNormalized(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.writeSnapshotToTable(tenantId, state, NORMALIZED_TABLE);
  }

  /**
   * Обычный путь загрузки: одна выборка + ЛЕНИВАЯ раскладка (§12.1).
   *
   * Строки кладутся в состояние как есть; коллекция превращается в записи по первому
   * обращению. Запрос списка слушателей платит за одну коллекцию, а не за полсотни.
   */
  private async loadModelIntoState(
    tenantId: string,
    state: InMemoryMvpState,
    tableName: string
  ): Promise<void> {
    const raw = await this.readRawSnapshot(tenantId, tableName);
    state.setRawSnapshot(raw, (collection, rawItems) => {
      /*
       * Старые строки с ОТКРЫТЫМ снилсом надо перешифровать. В памяти они выглядят так же,
       * как расшифрованные, поэтому по отпечатку сошли бы за «не менялись» — и ПДн остались
       * бы открытыми навсегда. Помечаем коллекцию к записи явно.
       */
      if (collection === 'learners' && rawItems.some((item) => hasLegacyPlaintextPii(item))) {
        state.markDirty(collection);
      }
      return this.materializeCollection(collection, rawItems);
    });
  }

  /**
   * Чтение состояния тенанта ОДНИМ запросом + ЛЕНИВАЯ раскладка (§12.1).
   *
   * Раньше здесь был цикл по коллекциям: на каждую свой `select`. Коллекций около
   * пятидесяти, то есть полсотни обращений к базе на КАЖДЫЙ запрос пользователя. Замер:
   * всё состояние центра с 500 слушателями читается одним запросом за 3 мс.
   *
   * Дальше строки НЕ раскладываются сразу: обычный запрос списка трогает одну-две
   * коллекции из полусотни, а платил за все (см. docs/LOAD_TEST_RESULTS.md). Раскладка
   * происходит по первому обращению — этим занимается само состояние.
   */
  private async readRawSnapshot(
    tenantId: string,
    tableName: string
  ): Promise<Map<string, unknown[]>> {
    const raw = new Map<string, unknown[]>();
    const rows = await this.db.query<{ collection: string; data: unknown }>(
      `select collection, data from ${tableName} where tenant_id = $1`,
      [tenantId]
    );
    for (const row of rows) {
      const list = raw.get(row.collection);
      if (list) {
        list.push(row.data);
      } else {
        raw.set(row.collection, [row.data]);
      }
    }
    return raw;
  }

  /**
   * Раскладка одной коллекции. ФТ-C3.3: ПДн слушателей зашифрованы at-rest — в память
   * кладём открытые значения, остальной рантайм шифрования не видит. Расшифровка теперь
   * платится только за ту коллекцию, которую действительно открыли.
   */
  private materializeCollection(collection: string, raw: unknown[]): unknown[] {
    return collection === 'learners' ? raw.map((item) => decryptLearnerPiiAtRest(item)) : [...raw];
  }

  private async readSnapshot(
    tenantId: string,
    tableName: string
  ): Promise<Record<MvpCollection, unknown[]>> {
    const raw = await this.readRawSnapshot(tenantId, tableName);
    const snapshot = {} as Record<MvpCollection, unknown[]>;
    for (const col of MVP_COLLECTIONS) {
      snapshot[col] = this.materializeCollection(col, raw.get(col) ?? []);
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
    /*
     * Пишем только тронутые и изменившиеся коллекции (§12.1, 2026-08-09).
     *
     * Нетронутая коллекция измениться не могла: до неё в этом запросе даже не обратились,
     * а в базе она лежит ровно такой, какой её прочитали. Раньше переписывались все
     * полсотни — на каждый запрос.
     */
    const collectionsToWrite = MVP_COLLECTIONS.filter((col) => state.hasChanged(col));

    if (collectionsToWrite.length === 0) {
      return;
    }

    await this.db.withTransaction(async (client: PoolClient) => {
      /*
       * Сверка версии — ПЕРВЫМ делом в транзакции (журнал 272/292). Если снимок успел
       * поменять другой экземпляр, дальше идти нельзя: запись переписывает коллекции
       * целиком и стёрла бы чужие изменения молча. Сторожит только та таблица, ИЗ КОТОРОЙ
       * читают: при двойной записи снимок пишется дважды.
       */
      if (tableName === this.authoritativeTable()) {
        await bumpTenantStateVersion(client, tenantId, 'mvp', state.stateVersionAtLoad ?? 0);
      }

      for (const col of collectionsToWrite) {
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
