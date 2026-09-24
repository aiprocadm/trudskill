import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  DOCUMENTS_ARRAY_COLLECTIONS,
  type DocumentsArrayCollection
} from './documents-collections.js';
import { DocumentsWriteOrchestrator } from './documents-write.orchestrator.js';
import { claimIssuedNumbers } from './issued-number-claims.js';
import { backendEnv } from '../../../env.js';
import {
  decryptDocumentSnapshotAtRest,
  encryptDocumentSnapshotAtRest
} from '../../../infrastructure/crypto/pii-crypto.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import {
  bumpTenantStateVersion,
  readTenantStateVersion
} from '../../../infrastructure/database/tenant-state-version.js';
import {
  type ProjectedRow,
  type ProjectionContext,
  TABLE_SPECS,
  projectEntity
} from '../../migration/backfill/normalized/normalized-projection.js';
import {
  deleteAbsent,
  deleteRows,
  loadGeneratedDocumentContext,
  upsertRows
} from '../../migration/backfill/normalized/normalized-upsert.js';

import type { GeneratedDocumentEntity } from '../documents.types.js';
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

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    const readModel = backendEnv.DOCUMENTS_READ_MODEL;
    // Версия снимка на момент чтения (журнал 272/292) — запись сверит её с текущей.
    state.stateVersionAtLoad = await readTenantStateVersion(
      (sql, params) => this.db.query<{ version: string | number }>(sql, params),
      tenantId,
      'documents'
    );

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
    /*
     * Чтение не должно ничего писать (журнал 299). Правило применили к состоянию mvp ещё
     * в Фазе 6, но к документам — нет: снимок переписывался на КАЖДЫЙ запрос, включая
     * обычный показ списка. Заодно это убирает лишние конфликты версий: запрос, который
     * ничего не менял, не имеет права двигать версию.
     */
    if (!state.hasChangedSinceLoad()) {
      return;
    }

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

  /**
   * Таблица, из которой читают. Версию снимка сторожит ТОЛЬКО она: при двойной записи
   * снимок пишется дважды, и вторая сверка заведомо не совпала бы — версию уже увеличила
   * первая. `shadow` читает legacy, поэтому legacy же и сторожит.
   */
  private authoritativeTable(): string {
    return backendEnv.DOCUMENTS_READ_MODEL === 'normalized' ? NORMALIZED_TABLE : LEGACY_TABLE;
  }

  async findGeneratedDocumentByQrToken(
    token: string
  ): Promise<{ tenantId: string; document: GeneratedDocumentEntity } | null> {
    if (!token) return null;
    // Read model determines which snapshot table holds the live documents (shadow reads legacy).
    const table =
      backendEnv.DOCUMENTS_READ_MODEL === 'normalized' ? NORMALIZED_TABLE : LEGACY_TABLE;
    const rows = await this.db.query<{ tenant_id: string; data: GeneratedDocumentEntity }>(
      `select tenant_id, data from ${table}
        where collection = 'generatedDocuments' and data->>'qrToken' = $1
        limit 1`,
      [token]
    );
    const row = rows[0];
    if (!row) return null;
    // SECURITY: это путь ПУБЛИЧНОЙ проверки по QR (без auth). Снапшот подстановки содержит
    // полные ПДн из бланка и здесь не нужен — вырезаем его вместо расшифровки, чтобы даже
    // будущая правка ответа не смогла его выдать наружу (ФТ-A6.1 «без лишних ПДн»).
    const document = { ...(row.data as GeneratedDocumentEntity & { variablesSnapshot?: unknown }) };
    delete document.variablesSnapshot;
    return { tenantId: row.tenant_id, document: document as GeneratedDocumentEntity };
  }

  private async readSnapshot(tenantId: string, tableName: string): Promise<DocumentsSnapshot> {
    const arrays = {} as Record<DocumentsArrayCollection, unknown[]>;
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const rows = await this.db.query<{ data: unknown }>(
        `select data from ${tableName} where tenant_id = $1 and collection = $2`,
        [tenantId, col]
      );
      // ФТ-A1.4/C3.3: снапшот подстановки лежит шифртекстом (в нём ПДн из бланка) —
      // рантайм получает его расшифрованным, шифрование живёт только на границе БД.
      arrays[col] =
        col === 'generatedDocuments'
          ? rows.map((row) => decryptDocumentSnapshotAtRest(row.data))
          : rows.map((row) => row.data);
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

    // Отпечаток снимаем СРАЗУ после раскладки — до того, как обработчик что-то поменяет.
    state.captureLoadFingerprint();
  }

  private async writeSnapshot(
    tenantId: string,
    state: InMemoryDocumentsState,
    tableName: string
  ): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      /*
       * Сверка версии — ПЕРВЫМ делом в транзакции (журнал 272/292). Если снимок успел
       * поменять другой экземпляр, дальше идти нельзя: запись переписывает коллекции
       * целиком и стёрла бы чужие изменения молча.
       */
      if (tableName === this.authoritativeTable()) {
        await bumpTenantStateVersion(client, tenantId, 'documents', state.stateVersionAtLoad ?? 0);
        /*
         * Заявка на номера (журнал 272) — вторая, независимая линия обороны. Версия снимка
         * ловит «нас опередили» вообще, а ключ таблицы заявок делает дубль номера физически
         * невозможным, даже если версия почему-то совпала.
         */
        await claimIssuedNumbers(client, tenantId, state.reservations);
      }

      for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
        await client.query(`delete from ${tableName} where tenant_id = $1 and collection = $2`, [
          tenantId,
          col
        ]);
        const items = this.pick(state, col) as Array<{ id: string; tenantId: string }>;
        for (const entity of items) {
          const atRest =
            col === 'generatedDocuments' ? encryptDocumentSnapshotAtRest(entity) : entity;
          await client.query(
            `insert into ${tableName} (tenant_id, collection, id, data, created_at, updated_at)
             values ($1, $2, $3, $4::jsonb, now(), now())`,
            [tenantId, col, entity.id, JSON.stringify(atRest)]
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

      // Фаза 1, срез 5a (РМ41): изменённые документы догоняют `documents.generated_documents`
      // в той же транзакции, что и снимок; при двойной записи — ровно один раз, у таблицы чтения.
      if (tableName === this.authoritativeTable()) {
        await this.projectChanged(client, tenantId, state);
      }
    });
  }

  /**
   * Проекция изменённых документов (срез 5a). Снимок остаётся источником правды; таблица
   * догоняет его на каждом сохранении. Контекст (зачисление → слушатель и группа, группа →
   * контрагент, файл) читается из таблиц той же транзакцией; чего там нет — обнуляется в
   * `payload` (как в бэкфилле), отказ строки уходит в журнал сверки `projection_failed`, а
   * снимок сохраняется всегда (РМ35).
   */
  private async projectChanged(
    client: PoolClient,
    tenantId: string,
    state: InMemoryDocumentsState
  ): Promise<void> {
    const changes = state.changedGeneratedDocuments();
    const documents = changes === 'all' ? state.generatedDocuments : changes.upserted;
    const deletedIds = changes === 'all' ? [] : changes.deletedIds;
    if (changes !== 'all' && documents.length === 0 && deletedIds.length === 0) return;

    const ctx = await loadGeneratedDocumentContext(
      client,
      tenantId,
      documents as unknown as Array<Record<string, unknown>>
    );
    await this.projectRows(client, tenantId, documents, ctx);

    const spec = TABLE_SPECS.generatedDocuments;
    if (changes === 'all') {
      await this.projectSafely(client, tenantId, null, () =>
        deleteAbsent(
          client,
          spec,
          tenantId,
          state.generatedDocuments.map((d) => d.id)
        )
      );
    } else if (deletedIds.length > 0) {
      await this.projectSafely(client, tenantId, null, () =>
        deleteRows(client, spec, tenantId, deletedIds)
      ).then(() => undefined);
    }
  }

  /** Пачкой в точке сохранения; при отказе — по одной, чтобы назвать плохую строку. */
  private async projectRows(
    client: PoolClient,
    tenantId: string,
    documents: GeneratedDocumentEntity[],
    ctx: ProjectionContext
  ): Promise<void> {
    if (documents.length === 0) return;
    const spec = TABLE_SPECS.generatedDocuments;
    const rows: Array<{ id: string; row?: ProjectedRow; error?: unknown }> = documents.map(
      (document) => {
        try {
          return {
            id: document.id,
            row: projectEntity('generatedDocuments', tenantId, document, ctx)
          };
        } catch (error) {
          return { id: document.id, error };
        }
      }
    );
    for (const bad of rows.filter((r) => r.error !== undefined)) {
      await this.logProjectionFailure(tenantId, bad.id, bad.error);
    }
    const good = rows.filter((r): r is { id: string; row: ProjectedRow } => r.row !== undefined);
    if (good.length === 0) return;

    await client.query('savepoint projection_batch');
    try {
      await upsertRows(
        client,
        spec,
        good.map((r) => r.row)
      );
      await client.query('release savepoint projection_batch');
      return;
    } catch {
      // Пачка не прошла — виновата одна или несколько строк; ниже они находятся поимённо.
      await client.query('rollback to savepoint projection_batch');
    }
    for (const { id, row } of good) {
      await this.projectSafely(client, tenantId, id, () => upsertRows(client, spec, [row]));
    }
  }

  /** Один шаг проекции в своей точке сохранения; отказ — в журнал сверки, снимок не страдает. */
  private async projectSafely(
    client: PoolClient,
    tenantId: string,
    documentId: string | null,
    step: () => Promise<void>
  ): Promise<void> {
    await client.query('savepoint projection_row');
    try {
      await step();
      await client.query('release savepoint projection_row');
    } catch (error) {
      // Отказ одного документа не должен откатить снимок (РМ35): шаг откатывается до точки
      // сохранения, а причина уходит в журнал сверки projection_failed и в лог.
      await client.query('rollback to savepoint projection_row');
      await this.logProjectionFailure(tenantId, documentId, error);
    }
  }

  private async logProjectionFailure(
    tenantId: string,
    documentId: string | null,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Проекция документа ${documentId ?? '*'} центра ${tenantId} не записана: ${message}`
    );
    await this.logReconciliationIssue(tenantId, {
      issueType: 'projection_failed',
      collection: 'generatedDocuments',
      entityId: documentId,
      details: { message }
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
