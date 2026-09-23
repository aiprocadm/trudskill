# Фаза 1 «Слой хранения», срез 1: контрагенты и группы — проекция при сохранении и чтение через SQL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **двумя PR**: 1a (задачи 1–5, поведение не меняется) и 1b (задачи 6–10, чтение под флагом).

**Goal:** Коллекции `counterparties` и `groups` начинают жить в нормализованных таблицах по-настоящему: каждое сохранение снимка проецирует изменённые сущности в `crm.counterparties`/`learning.groups` в той же транзакции (1a), а списки, карточки и lookup этих коллекций читаются из SQL с пагинацией, поиском и сортировкой базой, когда включён флаг `LMS_NORMALIZED_COLLECTIONS` (1b). Снимок остаётся источником правды для записи; откат — пустой флаг.

**Architecture:** Разведка (§5.560): `hasChanged` знает только «коллекция изменилась», поэтому состояние получает поштучные отпечатки для проецируемых коллекций (`changedEntities()` → upsert/delete или `'all'`); проекция встраивается в `writeSnapshotToTable` после записи снимка, только для авторитетной таблицы, с точкой сохранения на сущность и записью отказа в журнал сверки (нарушение `UNIQUE (tenant_id, code)` не должно откатывать снимок). Проекция включена всегда при Postgres-драйвере (РМ35) — иначе записи между бэкфиллом и включением флага терялись бы; флаг управляет только чтением. Чтение: репозитории (`interface + pg + память`) по образцу `tasks`, ветка в контроллере (`MvpService` синхронен и стережётся сторожами), декоратор `@ReadsNormalized('groups')` — интерцептор не грузит снимок и не берёт замок для такого GET. Общий upsert выносится из бэкфилла в `normalized-upsert.ts`, обратная функция `rowToEntity` разворачивает `payload` (иначе ответ разойдётся со снимком).

**Tech Stack:** NestJS, `pg`, `Reflector`/`SetMetadata`, vitest, testcontainers, k6.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.2 («одна коллекция — один репозиторий; MvpService читает списки через репозиторий с SQL-фильтрами и пагинацией; порядок: двойная запись → переключение чтения → отключение записи в снимок»), МГ-A2.1 (SQL-пагинация `q, status, page, page_size, sort` без изменения контракта), МГ-A3.1 (p95 ≤ 500 мс на `/groups`). Дорожная карта — [slice-0](./2026-09-23-cdoprof-migration-phase-1-slice-0-migrations.md).

## Global Constraints

- Контракт ответов не меняется: `{ items, page, pageSize, total }`, формы `Counterparty`/`GroupEntity` из `mvp.types.ts` (включая поля импорта — они возвращаются из `payload`).
- `MvpService` не трогать: методы остаются синхронными (госреестры, `cross-tenant-sweep` ищет `get*` регэкспом и зовёт синхронно).
- SQL: имена таблиц литералами, `tenant_id` в каждом `select/update/delete`, `order by … , id asc` при `limit/offset`, `total` отдельным `count(*)`, белый список сортировок.
- Проекция — только в авторитетной таблице, только внутри транзакции снимка, отказ сущности не роняет запись снимка.
- Декоратор чтения из SQL вешается только на чистые GET (`counterparties`, `counterparties/lookup`, `counterparties/:id`, `groups`, `groups/lookup`, `groups/:id`, `portal/groups`).
- Новый env `LMS_NORMALIZED_COLLECTIONS` (строка через запятую, по умолчанию пусто, проверка на известные коллекции), описан в `.env.example` и `docs/environment-and-config.md`.
- ≤30 файлов на PR, зелёный `pnpm ci:check`; k6 «после» на `trudskill_perf` — в 1b.

## Review Focus

1. Создание группы с кодом, который уже есть в `learning.groups` другого источника (бэкфилл): снимок сохраняется, проекция этой группы — в журнал сверки, а не 500 пользователю.
2. Присваивание коллекции целиком (`state.groups = …`) и `markDirty`: проекция делает полный upsert и удаляет из таблицы строки, которых нет в снимке.
3. Удаление контрагента, на которого ссылаются группы: порядок «upsert групп → delete контрагента».
4. Список с `q=2024-0`: в SQL ищется по коду, названию, ИНН и `payload`, а не по датам и id (дрейф контракта записан в журнал, РМ36).
5. GET под декоратором при выключенном флаге — снимок грузится как раньше (декоратор без флага ничего не меняет).

---

## PR 1a — проекция при сохранении (поведение снаружи не меняется)

### Task 1: общий upsert и обратная проекция

**Files:** Create `apps/backend/src/modules/migration/backfill/normalized/normalized-upsert.ts`; Modify `normalized-backfill.service.ts` (использует общий), `normalized-projection.ts` (`rowToEntity`), `normalized-projection.test.ts`.

**Interfaces (Produces):**

```ts
// normalized-upsert.ts
export async function upsertRows(
  client: PoolClient,
  spec: TableSpec,
  rows: ProjectedRow[]
): Promise<void>; // multi-VALUES по 500, on conflict (id) do update … where tenant_id = excluded.tenant_id; при rowCount < rows.length — Error
export async function upsertRow(
  client: PoolClient,
  spec: TableSpec,
  row: ProjectedRow
): Promise<void>;
export async function deleteRows(
  client: PoolClient,
  spec: TableSpec,
  tenantId: string,
  ids: string[]
): Promise<void>;
export async function deleteAbsent(
  client: PoolClient,
  spec: TableSpec,
  tenantId: string,
  keepIds: string[]
): Promise<void>; // delete … where tenant_id = $1 and not (id = any($2))
export async function loadCounterpartyIds(
  client: PoolClient,
  tenantId: string,
  ids: string[]
): Promise<Set<string>>;
// normalized-projection.ts
export function rowToEntity(
  collection: HotCollection,
  row: Record<string, unknown>
): Record<string, unknown>; // колонки → camelCase по обратной таблице, payload разворачивается, sourceStatus → status, payload.counterpartyId/inn → поля; Date → ISO
```

- [ ] Тест кругового прохода: `rowToEntity(projectEntity(x))` для контрагента с плохим ИНН и статусом `blocked`, группы с `whatever`/`cp_missing` и полями импорта возвращает исходную сущность (с точностью до `createdAt/updatedAt` ISO).
- [ ] Реализация; бэкфилл переходит на `upsertRow`. Commit `refactor(backend): общий upsert нормализованных таблиц и обратная проекция rowToEntity`.

### Task 2: флаг `LMS_NORMALIZED_COLLECTIONS`

**Files:** Modify `apps/backend/src/config/env.schema.ts` (или где `LMS_READ_MODEL`), `apps/backend/.env.example`, `docs/environment-and-config.md`; Create `apps/backend/src/modules/mvp/infrastructure/normalized-collections.ts` (`isNormalizedRead(collection): boolean`, разбор строки в `Set`, отказ на неизвестном имени) + `normalized-collections.test.ts`.

- [ ] Тест: пусто → ничего; `groups,counterparties` → оба; `learners` (не в срезе) → ошибка конфигурации с понятным текстом.
- [ ] Реализация. Commit `feat(backend): флаг LMS_NORMALIZED_COLLECTIONS — чтение по коллекциям (РМ32)`.

### Task 3: поштучные отпечатки состояния

**Files:** Modify `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`, `lazy-state.test.ts`, `lazy-state.perf.test.ts`.

**Interfaces:** `PROJECTED_COLLECTIONS = ['counterparties','groups']`; `changedEntities(collection): { upserted: unknown[]; deletedIds: string[] } | 'all'`; `hasChanged` кешируется на время сохранения (сброс при `set`/`markDirty`).

- [ ] Тесты: правка одной группы → `upserted` из одной; удаление из массива → `deletedIds`; присваивание целиком или `markDirty` → `'all'`; отпечаток коллекции байт-в-байт равен `JSON.stringify(items)` (старые тесты не меняются); соседние коллекции не материализуются.
- [ ] Реализация (в `readCollection` для проецируемых коллекций — `Map<id, string>`; отпечаток коллекции собирается из частей). Commit `feat(backend): поштучные отпечатки проецируемых коллекций состояния`.

### Task 4: проекция в транзакции снимка

**Files:** Modify `postgres-mvp-persistence.backend.ts` (метод `projectChanged(client, tenantId, state)` после цикла записи, при `tableName === authoritativeTable()`; порядок: upsert контрагентов → upsert групп → delete групп → delete контрагентов; `'all'` → полный upsert + `deleteAbsent`; точка сохранения на сущность, отказ → `learning.mvp_reconciliation_log` с `issue_type = 'projection_failed'` и текстом), `postgres-mvp-persistence.backend.test.ts` (мок: `withTransaction` отдаёт клиента, `query` возвращает `{ rows: [], rowCount: N }` для вставок; ожидания `insert into crm.counterparties`/`learning.groups`), Create `postgres-mvp-persistence.projection.integration.test.ts` (withTestDb, вся цепочка: сохранение снимка с новой группой → строка в `learning.groups`; дубль кода → снимок сохранён, строка в журнале сверки; удаление контрагента с группами → порядок; `'all'` удаляет лишние).

- [ ] Тесты → реализация. Commit `feat(backend): проекция изменённых контрагентов и групп в нормализованные таблицы при сохранении снимка (РМ35)`.

### Task 5: документация 1a

**Files:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md` (РМ35, статусы), `LMS_AGENT_HANDOFF.md` §5.560, `README.md`, `docs/mvp-domain-database.md`. `pnpm ci:check`, PR.

---

## PR 1b — чтение через SQL под флагом

### Task 6: репозитории

**Files:** Create в `apps/backend/src/modules/mvp/infrastructure/repositories/`: `counterparties.repository.ts` (интерфейс + токен `COUNTERPARTIES_REPOSITORY`), `groups.repository.ts` (интерфейс + токен), `postgres-counterparties.repository.ts`, `postgres-groups.repository.ts`, `in-memory-registry.repository.ts` (одна реализация поверх массива для обеих — повторяет семантику `MvpService.list`), `normalized-list-query.ts` (разбор `page`/`page_size` 50/200, белый список `sort` → колонка, `q` → `ilike` с экранированием `%`/`_`), `repositories.integration.test.ts` (withTestDb: изоляция центров, пагинация, `total`, `status`, `q` по коду/названию/ИНН/`payload`, `sort` по белому списку с добивкой `id`, скоуп `counterparty_id` для портала, `get` чужого центра → null).

**Interfaces:**

```ts
export interface RegistryListQuery {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
  sort?: { column: string; direction: 'asc' | 'desc' };
  counterpartyId?: string; /* скоуп портала */
}
export interface GroupsRepository {
  list(tenantId: string, query: RegistryListQuery): Promise<ListResponse<GroupEntity>>;
  get(tenantId: string, id: string): Promise<GroupEntity | null>;
  lookup(tenantId: string, query: RegistryListQuery): Promise<ListResponse<LookupItem>>;
}
// CounterpartiesRepository — та же форма для Counterparty
```

SQL списка: `select … from learning.groups where tenant_id = $1 [and status = $2] [and (code ilike $3 or name ilike $3 or payload::text ilike $3)] [and counterparty_id = $4] order by <col> <dir>, id asc limit $n offset $m`; сортировка по умолчанию `created_at asc, id asc`.

- [ ] Тесты → реализация. Commit `feat(backend): репозитории контрагентов и групп (интерфейс, Postgres, память)`.

### Task 7: декоратор и интерцептор

**Files:** Create `apps/backend/src/modules/mvp/infrastructure/reads-normalized.decorator.ts` (`READS_NORMALIZED` + `ReadsNormalized(collection)` через `SetMetadata`); Modify `mvp-request-persistence.interceptor.ts` (`@Optional() @Inject(Reflector)` последним, `context.getHandler?.()`; если у ручки метаданные и `isNormalizedRead(collection)` → `next.handle()` без замка и загрузки), `mvp-request-persistence.interceptor.test.ts` (пропуск при флаге; без флага — как раньше; мок без `getHandler` не падает).

- [ ] Commit `feat(backend): декоратор ReadsNormalized — GET из SQL не грузит снимок`.

### Task 8: ветка в контроллере и модуль

**Files:** Modify `mvp.controller.ts` (репозитории — последними в конструкторе; 7 ручек: `async` + `isNormalizedRead('groups') ? this.groups.list(...) : this.mvpService.listGroups(...)`; `get` → 404 `not_found` с тем же текстом), `mvp.module.ts` (фабрики: `ALLOW_IN_MEMORY_STATE` → память, иначе Postgres), `mvp.learner-documents.controller.test.ts` (аргументы), `mvp.http.integration.test.ts` или новый `mvp.normalized-reads.http.integration.test.ts` (границы прав не меняются; при флаге ответ идёт из репозитория-заглушки).

- [ ] Commit `feat(backend): списки, карточки и lookup контрагентов и групп читаются из SQL под флагом`.

### Task 9: замер «после» (МГ-A3.1)

- [ ] На `trudskill_perf`: бэкфилл `lms_normalized` (`POST /migration/backfill/runs/start`), `LMS_NORMALIZED_COLLECTIONS=groups,counterparties` в `perf.env`, `run-k6.sh`; результат — `docs/LOAD_TEST_RESULTS.md` (раздел «после, срез 1»). Цель: `/groups` p95 ≤ 500 мс при VUS=10 (было 13 993 мс).

### Task 10: документация 1b

**Files:** трекер (РМ36 — дрейф `q`; МГ-A2.1 частично, МГ-A3.1 по `/groups`), журнал расхождений (`q` по JSON → по полям; `status` вне CHECK), handoff §5.561, README, `docs/environment-and-config.md`, `docs/LOAD_TEST_RESULTS.md`. `pnpm ci:check`, PR.

## Риски (из разведки)

- Уникальность `code` нигде не проверяется при создании — точка сохранения и журнал обязательны, иначе снимок не сохранится.
- Компенсация двойной записи (`compensateNormalizedWrite`) проекцию не откатывает — проекция только в авторитетной таблице, а при `LMS_DUAL_WRITE_ENABLED` таблица stage1 не авторитетна.
- Метрика `mvp_persistence_load_total` просядет для GET под декоратором — отметить в handoff.
- Синтетика перф-стенда пишет прямо в снимок, мимо проекции: перед замером — бэкфилл.
