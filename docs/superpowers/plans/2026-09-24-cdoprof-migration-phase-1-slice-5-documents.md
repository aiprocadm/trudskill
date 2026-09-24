# Фаза 1 «Слой хранения», срез 5: документы (`generatedDocuments`) — проекция и чтение через SQL в домене документов

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **двумя PR**: 5a (проекция и попутная починка панели) и 5b (чтение под флагом).

**Goal:** Последняя «горячая» коллекция — `generatedDocuments` (домен документов, снимок `documents.runtime_documents`) — живёт в `documents.generated_documents` по-настоящему: сохранение снимка документов проецирует изменённые документы (контекст зачисления, группы и файла — из таблиц той же транзакции), удаления слушателей/групп/контрагентов в MVP не упираются в ключи документов, а три чистые GET-ручки домена документов (`documents`, `documents/:id`, `admin/documents/issuance-journal` + `.csv`) читаются из SQL под флагом `generatedDocuments` без загрузки девяти запросов снимка.

**Architecture (по разведке §5.569).** У домена документов нет ни поштучных отпечатков (один отпечаток на всё состояние), ни крючка проекции, ни пропуска снимка в `DocumentsRequestPersistenceInterceptor`; `writeSnapshot` переписывает все 8 коллекций в одной транзакции; сохранение документов — отдельная транзакция, которая на смешанных маршрутах коммитится РАНЬШЕ сохранения MVP. Поэтому: (РМ41) проекция живёт в `writeSnapshot` после цикла коллекций и только для `authoritativeTable()`; контекст (`learning.enrollments`, `learning.groups`, `storage.files`) грузится из таблиц той же транзакцией общей функцией `loadGeneratedDocumentContext` (вынести из `normalized-backfill.service.ts::loadContext`); ссылка на сущность, которой в таблицах ещё нет, обнуляется в `payload` (как в бэкфилле) — её восстановит следующий прогон бэкфилла/сверки, ждать чужую транзакцию нельзя. (РМ42) Поштучные отпечатки — только для `generatedDocuments` (`changedGeneratedDocuments(): {upserted, deletedIds} | 'all'`), общий отпечаток решает «есть ли что писать» как прежде. Обратные ключи: `detachDocumentsFrom(client, tenantId, column, scope)` для `learner_id`/`group_id`/`counterparty_id` (исходник — в `payload`), вызывается из `projectChanged` MVP перед удалением слушателей, групп, контрагентов. (РМ43) Чтение под флагом — новый `DocumentsNormalizedReadsService` + `GENERATED_DOCUMENTS_REPOSITORY` в `documents/infrastructure/`; `search` в SQL — по `name`, `document_number`, `document_type`/`kind_code` (снимок искал подстроку по JSON, включая расшифрованный `variablesSnapshot` с ПДн — так искать нельзя, записать как дрейф). Смешанные маршруты MVP (`portal/documents`, `me/documents`, `enrollments/:id/documents|certificates`, `close-group/:groupId/package`, скачивания) и публичная проверка по QR остаются на снимке. `variables_snapshot` в таблице лежит шифртекстом — репозиторий расшифровывает (`decryptDocumentSnapshotAtRest`), как чтение снимка.

**Попутная починка (журнал 621, дефект логики):** `GET dashboards/manager` вызывает `DocumentsService.issuedDocumentRefs`, но на ручке нет `DocumentsRequestPersistenceInterceptor` — при драйвере `postgres` состояние документов пусто, и блок «выданные документы» панели руководителя всегда пуст. Починка — интерцептор на ручке + тест. Идёт в PR 5a.

**Tech Stack:** как в срезах 1–4.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.1 («generatedDocuments → documents.generated_documents»), МГ-A1.2, МГ-A2.1 (`/documents`).

## Global Constraints

- Форма ответов не меняется: `rowToEntity('generatedDocuments')` возвращает сущность снимка (`fileId` из `payload`, если файл не найден; `isFinal` исходный; без `learnerId/groupId/counterpartyId/enrollmentId/kindCode/isExternal`, если их не было — пометки `__synthesized`/скрытые колонки по образцу срезов 3–4).
- `DOCUMENTS_READ_MODEL`/`DOCUMENTS_DUAL_WRITE_ENABLED` не трогать — они про JSON-двойник `stage1`; проекция привязана к `authoritativeTable()` и идёт ровно один раз при dual-write.
- Сторожа: `tenant-state-guards.security.test.ts` (строки `bumpTenantStateVersion(`, `claimIssuedNumbers(` в тексте бэкенда документов — не переставлять), `tenant-scoped-reads` (`tenant_id` буквально), `silent-catch`, `constraints-on-live-tables` (без изменений), `di-explicit-injection` (`@Inject` на каждой зависимости, `Reflector` — последним и `@Optional()`, тесты собирают интерцептор позиционно).
- ≤30 файлов на PR, зелёный `pnpm ci:check` (код в worktree не трогать, пока идёт прогон).

## Review Focus

1. Выпуск документа воркером (`DocumentsTenantRunner` → `completeTask`) проецирует строку с `learner_id`/`group_id`/`storage_file_id` из таблиц; документ на зачисление, которого в `learning.enrollments` ещё нет, — строка с обнулёнными ссылками и исходником в `payload`, не отказ.
2. Правка бланка или задачи (другие коллекции) не трогает `documents.generated_documents` вовсе.
3. Отзыв документа (`revoke` → `status='revoked'`, `isFinal` остаётся `true` в снимке) — в таблице `is_final=false`, исходный флаг в `payload` (CHECK `is_final ⇒ status='final'`).
4. Удаление слушателя/группы/контрагента в MVP при наличии документов — ссылки документов обнуляются, удаление проходит, снимок документов не меняется.
5. Под флагом `generatedDocuments` `GET documents?search=` находит по названию и номеру, но не по ПДн из бланка; `documents/:id` чужого центра — 404 с тем же кодом.

---

## PR 5a — проекция

### Task 1: поштучные отпечатки документов и общий загрузчик контекста

**Files:** Modify `documents/in-memory-documents.state.ts` (`documentFingerprintAtLoad: Map<string,string> | undefined`, снимается в `captureLoadFingerprint`; `changedGeneratedDocuments()`), `migration/backfill/normalized/normalized-upsert.ts` (`loadGeneratedDocumentContext(client, tenantId, documents)`, `detachDocumentsFrom`), `normalized-backfill.service.ts` (`loadContext` зовёт общую функцию), `normalized-projection.ts` (пометки полей, выдуманных для документа: `kindCode`, `isExternal`, `finalizedAt`, `documentDate`, `enrollmentId`, `learnerId`, `groupId`, `counterpartyId` — через `__synthesized`/`HIDDEN_COLUMNS`, круговой тест).

- [x] Вошло в коммит a148967 (отклонение: Task 1 и Task 2 — один коммит).

### Task 2: крючок проекции в бэкенде документов и обратные ключи в MVP

**Files:** Modify `documents/infrastructure/postgres-documents-persistence.backend.ts` (`projectChanged` после цикла коллекций внутри транзакции, только для `authoritativeTable()`; пачка → по одной → `projection_failed` в `documents.reconciliation_log` через `client`, не `db.query`), `postgres-documents-persistence.backend.test.ts` (мок отвечает `rowCount` по числу кортежей; тесты: правка бланка не проецирует, новый документ проецирует после вставок снимка, отказ одной строки не роняет снимок), `mvp/infrastructure/postgres-mvp-persistence.backend.ts` (`prepare` для `learners`/`groups`/`counterparties` зовёт `detachDocumentsFrom`), `postgres-mvp-persistence.backend.test.ts` (регэксп + ожидания `update documents.generated_documents`), новый `documents/infrastructure/postgres-documents-persistence.projection.integration.test.ts` (Docker: выпуск, отзыв, документ без зачисления, удаление слушателя с документом через MVP).

- [x] Commit a148967.

### Task 3: панель руководителя читает документы (журнал 621)

**Files:** Modify `mvp/mvp.controller.ts` (`@UseInterceptors(DocumentsRequestPersistenceInterceptor)` на `dashboards/manager`), тест в `mvp.domains.http.integration.test.ts` (документ, созданный под интерцептором документов, виден в ответе панели).

- [x] Commit d6b0977.

### Task 4: документация 5a

- [x] Сделано (§5.569).

handoff §5.569, трекер (РМ41–РМ43, очередь, МГ-A1), README, план; журнал 621 (исправлено), 622 (поиск по ПДн в `listDocuments.search`), 623 (`page()` документов без потолка `pageSize` для внутренних вызовов — есть), 624 (проекция документов и MVP в разных транзакциях — ссылки догоняет бэкфилл). `pnpm ci:check`, PR.

---

## PR 5b — чтение под флагом

### Task 5: репозиторий, сервис, пропуск снимка, ручки

**Files:** Create `documents/infrastructure/repositories/generated-documents.repository.ts` (+ `postgres-`, `in-memory-`: `list(tenantId, {page,pageSize,search?,documentType?,sourceEntityType?,sourceEntityId?})`, `get`, `listIssued(tenantId, IssuedDocumentFilter)`), `documents/infrastructure/documents-normalized-reads.service.ts` (+ тест); Modify `documents/infrastructure/documents-request-persistence.interceptor.ts` (`@Optional() @Inject(Reflector)` последним; `readsFromNormalizedTable` как в MVP), `documents/documents.controller.ts` (три ручки + `.csv` под `@ReadsNormalized('generatedDocuments')`), `documents/documents.module.ts` (фабрика по `DOCUMENTS_PERSISTENCE_DRIVER`), `mvp/infrastructure/normalized-collections.ts` (+`generatedDocuments`; тест — пример недопустимой → `tasks`), `.env.example`, `docs/environment-and-config.md`, `repositories.integration.test.ts` документов (Docker), тест интерцептора документов (пропуск при флаге).

- [x] Commit 800c3de.

### Task 6: документация 5b и замер

- [x] Сделано (§5.570, `LOAD_TEST_RESULTS.md`).

handoff §5.570, трекер (МГ-A1/A2 — все горячие коллекции под флагом), план; k6 «после» с `LMS_NORMALIZED_COLLECTIONS=…,groupCourses,examResults,generatedDocuments` (`docs/LOAD_TEST_RESULTS.md`). `pnpm ci:check`, PR.

## Риски (из разведки)

- Инъекция проекции в `writeSnapshot` идёт после `claimIssuedNumbers` — сторож `tenant-state-guards` ищет строки по тексту, порядок не менять.
- `DocumentsTenantRunner` сохраняет в `finally` даже после исключения обработчика — проекция тоже сработает на частичном сохранении; это поведение снимка, не расширять.
- Устаревание денормализованных `group_id`/`counterparty_id` у документа при смене группы зачисления — записать (журнал), чинит бэкфилл/сверка.
- `search` по ПДн (журнал 622) — в SQL намеренно не воспроизводится.
