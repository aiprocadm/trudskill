import { Inject, Injectable, Logger } from '@nestjs/common';

import { PROJECTED_COLLECTIONS, type ProjectedCollection } from './in-memory-mvp.state.js';
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
import {
  type ProjectedRow,
  TABLE_SPECS,
  emptyContext,
  projectEntity
} from '../../migration/backfill/normalized/normalized-projection.js';
import {
  deleteAbsent,
  deleteRows,
  detachGroupsFromCounterparties,
  detachHistoryFromEnrollments,
  loadCounterpartyIds,
  loadUserIds,
  upsertRows
} from '../../migration/backfill/normalized/normalized-upsert.js';

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

      // Фаза 1 (срез 1a): изменённые контрагенты и группы — в нормализованные таблицы, той же
      // транзакцией и только для авторитетной таблицы (при двойной записи — один раз).
      if (tableName === this.authoritativeTable()) {
        await this.projectChanged(client, tenantId, state);
      }
    });
  }

  /**
   * Проекция изменённых сущностей проецируемых коллекций в нормализованные таблицы (РМ35).
   *
   * Снимок остаётся источником правды; таблицы догоняют его на каждом сохранении. Порядок
   * уважает внешний ключ группа → контрагент: вставки контрагентов, вставки групп, удаления
   * групп, удаления контрагентов. Группа, чей контрагент из снимка исчез, получает
   * `counterparty_id = null` (исходное значение — в `payload`).
   *
   * Отказ одной сущности (например, `UNIQUE (tenant_id, code)` — код группы нигде не проверяется
   * при создании) не должен откатить снимок: пачка пишется в точке сохранения, при отказе
   * строки идут по одной, и каждая плохая уходит в журнал сверки `projection_failed`.
   */
  private async projectChanged(
    client: PoolClient,
    tenantId: string,
    state: InMemoryMvpState
  ): Promise<void> {
    const changes = Object.fromEntries(
      PROJECTED_COLLECTIONS.map((col) => [col, state.changedEntities(col)])
    ) as Record<ProjectedCollection, ReturnType<InMemoryMvpState['changedEntities']>>;
    if (
      PROJECTED_COLLECTIONS.every(
        (col) =>
          changes[col] !== 'all' &&
          changes[col].upserted.length === 0 &&
          changes[col].deletedIds.length === 0
      )
    ) {
      return;
    }

    const entityIds = (col: ProjectedCollection): string[] =>
      (this.pick(state, col) as Array<{ id: string }>).map((e) => e.id);
    const upsertedOf = (col: ProjectedCollection): unknown[] =>
      changes[col] === 'all' ? this.pick(state, col) : changes[col].upserted;
    const deletedOf = (col: ProjectedCollection): string[] =>
      changes[col] === 'all' ? [] : changes[col].deletedIds;

    // 1. Контрагенты.
    await this.projectRows(
      client,
      tenantId,
      'counterparties',
      upsertedOf('counterparties'),
      emptyContext()
    );

    // 2. Слушатели (срез 2a): ПДн шифруются проекцией; учётная запись — только существующая
    // (иначе `user_id` обнулился бы после бэкфилла, а исходник ушёл бы в payload).
    const learners = upsertedOf('learners') as Array<{ linkedIamUserId?: unknown }>;
    const learnerCtx = emptyContext();
    learnerCtx.users = await loadUserIds(client, tenantId, [
      ...new Set(
        learners
          .map((l) => l.linkedIamUserId)
          .filter((v): v is string => typeof v === 'string' && v !== '')
      )
    ]);
    await this.projectRows(client, tenantId, 'learners', learners, learnerCtx);

    // 3. Группы: ссылка на контрагента допустима, только если он есть в таблице И не уходит.
    const groups = upsertedOf('groups') as Array<{ counterpartyId?: unknown }>;
    const ctx = emptyContext();
    const referenced = [
      ...new Set(
        groups
          .map((g) => g.counterpartyId)
          .filter((v): v is string => typeof v === 'string' && v !== '')
      )
    ];
    const gone = new Set(deletedOf('counterparties'));
    const survivors =
      changes.counterparties === 'all' ? new Set(entityIds('counterparties')) : null;
    for (const id of await loadCounterpartyIds(client, tenantId, referenced)) {
      if (!gone.has(id) && (survivors === null || survivors.has(id))) ctx.counterparties.add(id);
    }
    await this.projectRows(client, tenantId, 'groups', groups, ctx);

    // 4. Курсы группы (срез 4a): после групп; курс и версия остаются в снимке (0105), ссылка
    // на группу не обнуляется — отсутствие группы это ошибка данных, строка уйдёт в журнал поимённо.
    await this.projectRows(
      client,
      tenantId,
      'groupCourses',
      upsertedOf('groupCourses'),
      emptyContext()
    );

    // 5. Зачисления и их история (срез 3a): ссылки на группу и слушателя не обнуляются —
    // отсутствие цели это ошибка данных, строка уйдёт в журнал поимённо. История — после зачислений.
    await this.projectRows(
      client,
      tenantId,
      'enrollments',
      upsertedOf('enrollments'),
      emptyContext()
    );
    await this.projectRows(
      client,
      tenantId,
      'enrollmentStatusHistory',
      upsertedOf('enrollmentStatusHistory'),
      emptyContext()
    );

    // 6. Результаты экзаменов (срез 4a): после зачислений и слушателей (внешние ключи на обоих);
    // тест и попытка — в снимке (0105). Пересдача обновляет ту же строку (UNIQUE по зачислению и тесту).
    await this.projectRows(
      client,
      tenantId,
      'examResults',
      upsertedOf('examResults'),
      emptyContext()
    );

    // 7. Удаления в обратном порядке ключей: результаты, история, зачисления (их история —
    // каскадом), курсы группы, группы, слушатели, контрагенты. Зачисление или слушатель, на которых
    // ещё ссылается результат из снимка, не удалится — отказ уйдёт в журнал поимённо, а пачка
    // удалений повторится по одной. Присвоение целиком — убрать лишнее.
    for (const col of [
      'examResults',
      'enrollmentStatusHistory',
      'enrollments',
      'groupCourses',
      'groups',
      'learners',
      'counterparties'
    ] as const) {
      const keep = entityIds(col);
      const gone = deletedOf(col);
      const prepare = async (): Promise<void> => {
        if (col === 'counterparties') {
          await detachGroupsFromCounterparties(
            client,
            tenantId,
            changes[col] === 'all' ? { keep } : { deleted: gone }
          );
        }
        if (col === 'enrollments') {
          await detachHistoryFromEnrollments(
            client,
            tenantId,
            changes[col] === 'all' ? { keep } : { deleted: gone }
          );
        }
      };
      if (changes[col] === 'all') {
        await this.projectSafely(client, tenantId, col, null, async () => {
          await prepare();
          await deleteAbsent(client, TABLE_SPECS[col], tenantId, keep);
        });
      } else if (gone.length > 0) {
        await this.projectDeletes(client, tenantId, col, gone, prepare);
      }
    }
  }

  /** Удаление пачкой в точке сохранения; при отказе — по одной, чтобы назвать строку, которую держит ключ. */
  private async projectDeletes(
    client: PoolClient,
    tenantId: string,
    col: ProjectedCollection,
    ids: string[],
    prepare: () => Promise<void>
  ): Promise<void> {
    await client.query('savepoint projection_delete');
    try {
      await prepare();
      await deleteRows(client, TABLE_SPECS[col], tenantId, ids);
      await client.query('release savepoint projection_delete');
      return;
    } catch {
      // Пачку держит одна или несколько строк — ниже они находятся поимённо.
      await client.query('rollback to savepoint projection_delete');
    }
    for (const id of ids) {
      await this.projectSafely(client, tenantId, col, id, async () => {
        if (col === 'enrollments') {
          await detachHistoryFromEnrollments(client, tenantId, { deleted: [id] });
        }
        await deleteRows(client, TABLE_SPECS[col], tenantId, [id]);
      });
    }
  }

  /** Пачкой в точке сохранения; при отказе — по одной, чтобы назвать плохую строку. */
  private async projectRows(
    client: PoolClient,
    tenantId: string,
    col: ProjectedCollection,
    entities: unknown[],
    ctx: ReturnType<typeof emptyContext>
  ): Promise<void> {
    if (entities.length === 0) return;
    const spec = TABLE_SPECS[col];
    const rows: Array<{ id: string; row?: ProjectedRow; error?: unknown }> = entities.map(
      (entity) => {
        const id = String((entity as { id?: unknown }).id ?? '');
        try {
          return { id, row: projectEntity(col, tenantId, entity, ctx) };
        } catch (error) {
          return { id, error };
        }
      }
    );
    for (const bad of rows.filter((r) => r.error !== undefined)) {
      await this.logProjectionFailure(tenantId, col, bad.id, bad.error);
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
      await this.projectSafely(client, tenantId, col, id, () => upsertRows(client, spec, [row]));
    }
  }

  /** Один шаг проекции в своей точке сохранения; отказ — в журнал сверки, снимок не страдает. */
  private async projectSafely(
    client: PoolClient,
    tenantId: string,
    col: ProjectedCollection,
    entityId: string | null,
    step: () => Promise<void>
  ): Promise<void> {
    await client.query('savepoint projection_row');
    try {
      await step();
      await client.query('release savepoint projection_row');
    } catch (error) {
      // Отказ одной сущности не должен откатить снимок (РМ35): шаг откатывается до точки
      // сохранения, а причина уходит в журнал сверки projection_failed и в лог.
      await client.query('rollback to savepoint projection_row');
      await this.logProjectionFailure(tenantId, col, entityId, error);
    }
  }

  private async logProjectionFailure(
    tenantId: string,
    col: ProjectedCollection,
    entityId: string | null,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Проекция ${col}/${entityId ?? '*'} центра ${tenantId} не записана: ${message}`
    );
    await this.logReconciliationIssue(tenantId, {
      issueType: 'projection_failed',
      collection: col,
      entityId,
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
