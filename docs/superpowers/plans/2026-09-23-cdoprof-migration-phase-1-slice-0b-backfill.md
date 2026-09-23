# Фаза 1 «Слой хранения», срез 0b: бэкфилл «снимок → нормализованные таблицы» со сверкой

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026).

**Goal:** Домен `lms_normalized` в существующем модуле дозаполнения (`modules/migration/backfill`): читает горячие коллекции из JSON-снимков (`learning.mvp_runtime_documents`, `documents.runtime_documents`) в порядке, уважающем внешние ключи, раскладывает каждую сущность по колонкам восьми таблиц (0104–0109), перешифровывает ПДн в колонки `*_enc`/`snils_hash`, фиксирует отказ каждой плохой строки поимённо и не останавливается, и по завершении пишет отчёт сверки в `migration.reconciliation_reports`.

**Architecture:** Статусы прогона, чекпоинт, ручки и хранение отчёта остаются в `BackfillService`; для домена `lms_normalized` он делегирует загрузку пачки, запись и построение отчёта новому `NormalizedBackfillService`. Маппинг «сущность → строка» — чистые функции в `normalized-projection.ts` с описанием колонок и их типов (по типу нормализуются значения для сравнимого хэша источника и цели). Перед кодом — миграция 0110, снимающая две мины, найденные разведкой: `UNIQUE NULLS NOT DISTINCT` у слушателей (в центре мог быть только один слушатель без логина и один без табельного номера) и CHECK статусов результатов экзамена, не знающий значений кода (`active`, `needs_review`); плюс `status`/`payload` у `group_courses` и `payload` у `exam_results`, чтобы ни одно поле сущности не терялось.

**Tech Stack:** PostgreSQL 16, `pg`, NestJS, vitest, testcontainers (`withTestDb`), `pii-crypto.ts`.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.2 («бэкфилл из снимка делает `migration/backfill` с отчётом сверки»), §17; предыдущий срез — [2026-09-23-cdoprof-migration-phase-1-slice-0-migrations.md](./2026-09-23-cdoprof-migration-phase-1-slice-0-migrations.md).

## Global Constraints

- Снимок — источник правды, бэкфилл его **не меняет**; таблицы-цели можно очистить и прогнать заново (`on conflict (id) do update`).
- Частичный успех: плохая строка → `backfill_items.status = 'failed'` + `error`, чекпоинт двигается, прогон продолжается. Прогон падает в `failed` только на ошибке инфраструктуры (нет связи, нет таблицы).
- ПДн в открытом виде в таблицы не пишутся: `snils`, `email`, `phone`, `birth_date`, `date_of_birth` остаются NULL; шифртекст — через `encryptLearnerPiiAtRest` (идемпотентна, заодно дошифровывает legacy-открытые значения).
- Каждый `select`/`update`/`delete` по таблице с `tenant_id` содержит `tenant_id` в тексте (сторож `tenant-scoped-reads`); писатели получают `PoolClient` параметром, координатор — внутри `withTransaction` (сторожа атомарности); фильтров `data->>` в `where` нет (`json-filters-indexed`); в коде нет подстроки `cdoprof` строчными (BR-020) — в комментариях только заглавными.
- Новых HTTP-маршрутов нет: только новое значение `domain`. Контракты, RBAC, URL не меняются.
- ≤30 файлов, зелёный `pnpm ci:check`.

## Review Focus

1. Два слушателя без `linkedIamUserId` в одном центре — после 0110 оба вставляются (интеграционный тест).
2. Результат экзамена со статусом `needs_review` — вставляется (0110 расширяет CHECK).
3. Зачисление с несуществующей группой — строка `failed` с текстом ошибки, соседние строки пачки записаны, прогон `completed`, отчёт показывает расхождение счётчиков.
4. Документ с `isFinal=true` и статусом `revoked` — вставляется с `is_final=false` (0003: `is_final ⇒ status='final'`), исходный `isFinal` — в `payload`.
5. Повторный прогон на уже заполненных таблицах не создаёт дублей и даёт тот же отчёт (upsert).

---

### Task 1: миграция 0110 — предпосылки бэкфилла

**Files:** Create `apps/backend/migrations/0110_phase1_backfill_prerequisites.sql`; Modify `apps/backend/src/infrastructure/database/phase-1-normalized-migrations.test.ts` (блок 0110).

- [x] Тест: `learners_tenant_user_uniq` и `learners_tenant_learner_no_uniq` снимаются; появляются `CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_user_uniq_idx … WHERE user_id IS NOT NULL` и `learners_tenant_learner_no_uniq_idx … WHERE learner_no IS NOT NULL`; `exam_results_status_chk` снят и заведён заново со списком `draft, final, void, active, needs_review`; колонки `group_courses.status text NOT NULL DEFAULT 'active'`, `group_courses.payload jsonb`, `exam_results.payload jsonb`.
- [x] Миграция. Commit `feat(backend): миграция 0110 — предпосылки бэкфилла Фазы 1 (уникальность слушателей, статусы результатов, payload)`.

### Task 2: проекция «сущность → строка» (чистые функции)

**Files:** Create `apps/backend/src/modules/migration/backfill/normalized/normalized-projection.ts`, `normalized-projection.test.ts`.

**Interfaces (Produces):**

```ts
export const HOT_COLLECTIONS = [
  'counterparties',
  'learners',
  'groups',
  'groupCourses',
  'enrollments',
  'enrollmentStatusHistory',
  'examResults',
  'generatedDocuments'
] as const;
export type HotCollection = (typeof HOT_COLLECTIONS)[number];
export type ColumnType = 'text' | 'num' | 'int' | 'bool' | 'ts' | 'date' | 'json';
export interface TableSpec {
  table: string;
  source: 'learning.mvp_runtime_documents' | 'documents.runtime_documents';
  columns: Record<string, ColumnType>;
  hasPayload: boolean;
}
export const TABLE_SPECS: Record<HotCollection, TableSpec>;
export interface ProjectionContext {
  enrollments: Map<string, { groupId: string; learnerId: string }>;
  groups: Map<string, { counterpartyId?: string }>;
  users: Set<string>;
  files: Set<string>;
  counterparties: Set<string>;
}
export interface ProjectedRow {
  columns: Record<string, unknown>;
  payload: Record<string, unknown>;
}
export function projectEntity(
  collection: HotCollection,
  tenantId: string,
  data: unknown,
  ctx: ProjectionContext
): ProjectedRow; // бросает ProjectionError с понятным текстом при отсутствии обязательного поля
export function canonicalHash(spec: TableSpec, columns: Record<string, unknown>): string; // sha256 нормализованных по типу значений, без created_at/updated_at/payload
export class ProjectionError extends Error {}
```

- [x] Тесты (без базы): контрагент с ИНН не по формату → `inn=null`, `payload.inn`; слушатель с открытым СНИЛС → `snils_enc` начинается с `enc:`, `snils_hash` = `snilsBlindIndex`, в `columns` нет `snils`/`email`/`phone`; статус слушателя вне списка → `'inactive'` + `payload.sourceStatus`; группа со статусом `closed` проходит, с `whatever` → `'draft'` + `payload.sourceStatus`; `counterpartyId` не из контекста → `null` + `payload.counterpartyId`; зачисление `completed` без `completedAt` → `completed_at = updatedAt`; документ `revoked` + `isFinal` → `is_final=false`, `payload.isFinal=true`; документ `'enrollment'` → `enrollment_id/learner_id/group_id` из контекста; `fileId` без `storage.files` → `storage_file_id=null`, `payload.fileId`; `canonicalHash` одинаков для `12.5` и `'12.50'`, для `Date` и ISO-строки.
- [x] Реализация. Commit `feat(backend): проекция сущностей снимка в колонки нормализованных таблиц (Фаза 1, срез 0b)`.

### Task 3: `NormalizedBackfillService` и делегирование из `BackfillService`

**Files:** Create `normalized/normalized-backfill.service.ts`; Modify `backfill.types.ts` (`BackfillDomain` + `'lms_normalized'`, `SnapshotBackfillDomain`, `BACKFILL_DOMAIN_TABLES: Record<SnapshotBackfillDomain, …>`), `backfill.request-dto.ts` (`DOMAINS`), `backfill.request-dto.test.ts`, `backfill.service.ts` (делегирование), `migration.module.ts` (провайдер), `backfill.service.test.ts` (конструктор).

**Interfaces:**

```ts
// normalized-backfill.service.ts
export class NormalizedBackfillService {
  constructor(@Inject(DatabaseService) db: DatabaseService) {}
  /** Одна пачка: читает следующую коллекцию/строки по чекпоинту (collection, tenant_id, id), пишет в транзакции с savepoint на строку, двигает чекпоинт. */
  processBatch(
    run: BackfillRunRecord
  ): Promise<{ processed: number; failed: number; completed: boolean }>;
  /** Счётчики (снимок vs таблица), статусы (data->>'status' vs колонка), расхождения хэшей по backfill_items. */
  buildReport(run: BackfillRunRecord): Promise<ReconciliationReport>;
}
```

Чекпоинт: `checkpoint_collection` = текущая коллекция (по порядку `HOT_COLLECTIONS`), `checkpoint_tenant_id`/`checkpoint_id` = последняя записанная строка; пустая выборка → следующая коллекция; после `generatedDocuments` → `completed`. Загрузка: `select tenant_id, id, data from <source> where collection = $1 and (tenant_id, id) > ($2, $3) order by tenant_id, id limit $4` (первая пачка коллекции — `('', '')`). Контекст на пачку: одним запросом `where tenant_id = $1 and id = any($2)` по зачислениям/группам/пользователям/файлам/контрагентам — только для коллекций, которым он нужен. Запись строки: `savepoint` → upsert → `backfill_items processed` с `source_hash`/`target_hash` (по перечитанной строке через `canonicalHash`) → `release`; ошибка → `rollback to savepoint` → `backfill_items failed` с `error`.

- [x] Правки типов/DTO/модуля/делегирования; `backfill.service.ts`: в `processNextBatch` для `lms_normalized` вызвать `normalized.processBatch(run)`, на `completed` — статус `completed` + `saveReport(runId, await normalized.buildReport(run))` (вынести запись отчёта в приватный `saveReport`); `generateReport` для старых доменов не меняется.
- [x] Commit `feat(backend): домен lms_normalized — бэкфилл снимка в таблицы с частичным успехом и отчётом сверки`.

### Task 4: интеграционный тест на живой базе

**Files:** Create `normalized/normalized-backfill.integration.test.ts`.

- [x] Тест (`describe.skipIf(!isDockerAvailable())`, полная цепочка миграций): два центра; в снимок вставляются вручную (`insert into learning.mvp_runtime_documents (tenant_id, collection, id, data, …)`): 2 контрагента (один с плохим ИНН), 3 слушателя (два без `linkedIamUserId`, один с открытым СНИЛС), 2 группы (`active`, `closed`), 2 курса группы, 3 зачисления (одно `completed` без `completedAt`, одно на несуществующую группу — должно упасть), 2 записи истории, 2 результата (`needs_review`, без `finalScore`), в `documents.runtime_documents` — 2 документа (`revoked`+`isFinal`, `'enrollment'`) и служебная строка `collection='idem'`. Прогон через `new BackfillService(handle as DatabaseService, new NormalizedBackfillService(handle as DatabaseService))` → `createAndRun('lms_normalized', 3)`. Проверки: `completed=true`; счётчики таблиц по центру 1; в `learning.learners` у слушателя с открытым СНИЛС `snils` NULL, `snils_hash` = `snilsBlindIndex`; `backfill_items` содержит одну строку `failed` с текстом про `enrollments_group_tenant_fk`; отчёт: `counts` для `enrollments` = источник 3 / цель 2, `missingOrMismatchedRecords` содержит `missing_in_target` для плохого зачисления, `hash_mismatch` нет; центр 2 (одна группа) не смешался; повторный прогон — те же счётчики.
- [x] Commit `test(backend): бэкфилл lms_normalized на живой базе — частичный успех, ПДн, сверка`.

### Task 5: сторожа и документация

**Files:** Modify `common/guards/constraints-on-live-tables.isolation.test.ts` (убрать `documents.generated_documents` из `DEAD_ON_PURPOSE` — таблица ожила), `common/guards/tenant-scoped-reads.isolation.test.ts` (реестр — если потребуется для `backfill_items` без `tenant_id`), `docs/mvp-domain-database.md`, `docs/TZ_CDOPROF_MIGRATION_STATUS.md` (РМ34, очередь, статусы, журнал), `LMS_AGENT_HANDOFF.md` §5.559, `README.md`, `CLAUDE.md` (0110).

- [x] `pnpm ci:check` зелёный; commit `docs: Фаза 1 срез 0b — handoff §5.559, трекер`; PR.
