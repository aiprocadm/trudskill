# Фаза 1 «Слой хранения», срез 0: миграции согласования (0104–0109)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026).

**Goal:** Привести нормализованные таблицы горячих коллекций (`crm.counterparties`, `learning.learners`, `learning.groups`, `learning.group_courses`, `learning.enrollments`, `learning.enrollment_status_history`, `assessment.exam_results`, `documents.generated_documents`) в состояние, в которое можно вставить строку из снимка, — с колонками §17, объединёнными CHECK статусов, индексами и точкой опоры для поиска.

**Architecture:** Шесть аддитивных SQL-миграций 0104–0109 (номера в ТЗ — предложения; 0103 занят правами задач). Мёртвые внешние ключи на таблицы, которые навсегда остаются снимком (`study_groups`, `documents.templates`, `learning.courses`, `assessment.tests`, …), снимаются (решение РМ31) и заменяются ключами на `learning.groups` в режиме `NOT VALID`. Код приложения таблицы в этом срезе ещё не трогает — чтение/запись переводят срезы 1–6 по отдельным планам. Тесты: текстовый тест миграций (как `tasks/migrations.0103.test.ts`) + интеграционный на `withTestDb` (полная цепочка, вставка строки в каждую таблицу, `EXPLAIN` без seq scan по `groups(tenant_id, status, starts_at)` — МГ-A4.1).

**Tech Stack:** PostgreSQL 16, чистый SQL, vitest, `@testcontainers/postgresql` (`src/testing/with-test-db.ts`).

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) §17, МГ-A1.1, МГ-A4.1; разведка — в handoff §5.558. Разбиение всей Фазы 1 — раздел «Дорожная карта срезов» ниже.

## Global Constraints

- Миграции только аддитивные в смысле данных: ни одна колонка не удаляется, ни одна строка не теряется; снятие ограничения допустимо только если оно ссылается на таблицу, которую рантайм не заполняет (РМ31), и записывается в комментарии миграции с именем ограничения — чтобы вернуть его было одной строкой.
- Каждый `ADD COLUMN` — `IF NOT EXISTS`, каждый индекс — `IF NOT EXISTS`, каждый `DROP CONSTRAINT` — `IF EXISTS`: повторный запуск безопасен.
- Никаких изменений в `packages/api-contracts`, RBAC, URL. Исторические миграции не правятся.
- Новые FK на `learning.groups` — `NOT VALID`; `VALIDATE CONSTRAINT` — в срезе 7 после бэкфилла.
- `pg_trgm` — расширение может быть недоступно роли БД стенда; миграция 0109 не должна падать из-за него (РМ33): `CREATE EXTENSION` в `DO`-блоке с перехватом ошибки, trgm-индексы создаются только при наличии расширения.
- CHECK статусов — объединение значений кода и §17; старые CHECK (0002 и 0014) снимаются в той же миграции, где ставится новый.
- ≤30 файлов в PR, зелёный `pnpm ci:check`.

## Review Focus

1. FK `enrollments.group_id → learning.groups` в режиме `NOT VALID` проверяет новые строки: тест интеграции вставляет зачисление с несуществующей группой и ждёт отказ `23503`.
2. Двойной FK на одну колонку `enrollments.learner_id` (0002 → `learning.learners`, 0014 → `core.users`): после 0105 остаётся только ключ на `learning.learners`; тест вставляет зачисление со слушателем, которого нет в `core.users`.
3. Учебная группа со статусом `closed` (его ставит `close-group-chain.service.ts:232`) должна проходить CHECK — тест вставляет группу `closed`.
4. Документ со статусом `archived`/`revoked` (`GeneratedDocumentStatus` в коде) должен проходить объединённый CHECK; `generated_documents_final_state_chk` (`is_final ⇒ status='final'`) остаётся — проекция обязана ставить `is_final = (status = 'final')`.
5. Результат экзамена без итогового балла (`finalScore?` необязателен в `ExamResult`) должен вставляться: `final_score` становится nullable.

---

### Task 1: 0104 — расширение `learning.groups`

**Files:**

- Create: `apps/backend/migrations/0104_learning_groups_extend.sql`
- Test: `apps/backend/src/infrastructure/database/phase-1-normalized-migrations.test.ts` (текстовые проверки; создаётся здесь, дополняется в задачах 2–6)

**Interfaces:**

- Produces: `learning.groups` с `UNIQUE (tenant_id, id)` (`groups_tenant_id_id_uniq`) — на неё ссылаются FK задачи 2; CHECK `learning_groups_status_chk` со списком `draft, scheduled, recruiting, active, in_progress, exam, documents, completed, closed, archived, cancelled`.

- [x] **Step 1: Текстовый тест** — файл теста читает все шесть миграций через `readFileSync(resolve(HERE, '../../../migrations/<file>'))`; для 0104 проверяет: `groups_tenant_id_id_uniq`, колонки `exam_date`, `responsible_user_id`, `closed_at`, `archived_at`, `study_form`, `notify_on_pass`, новый CHECK содержит `'closed'` и `'recruiting'`, старый `learning_groups_status_chk` снимается (`DROP CONSTRAINT IF EXISTS learning_groups_status_chk`), индексы `groups_tenant_status_starts_idx`, `groups_tenant_exam_date_idx`, `groups_tenant_ends_idx`, `groups_tenant_responsible_idx`.
- [x] **Step 2: Запустить — красный** (`pnpm --filter @trudskill/backend exec vitest run src/infrastructure/database/phase-1-normalized-migrations.test.ts --no-file-parallelism`).
- [x] **Step 3: Миграция**

```sql
-- 0104_learning_groups_extend.sql — ТЗ перехода с CDOPROF §17 (groups), Фаза 1 срез 0.
ALTER TABLE learning.groups
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS exam_access_from timestamptz,
  ADD COLUMN IF NOT EXISTS exam_access_to timestamptz,
  ADD COLUMN IF NOT EXISTS materials_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS practice_from date,
  ADD COLUMN IF NOT EXISTS practice_to date,
  ADD COLUMN IF NOT EXISTS study_form text,
  ADD COLUMN IF NOT EXISTS is_dot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS education_form_at_ppo text,
  ADD COLUMN IF NOT EXISTS access_mode text,
  ADD COLUMN IF NOT EXISTS enrollment_mode text,
  ADD COLUMN IF NOT EXISTS remote_signature boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_identity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsible_user_id text,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS learner_message text,
  ADD COLUMN IF NOT EXISTS notify_on_pass jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE learning.groups
  DROP CONSTRAINT IF EXISTS groups_tenant_id_id_uniq,
  ADD CONSTRAINT groups_tenant_id_id_uniq UNIQUE (tenant_id, id);
ALTER TABLE learning.groups
  DROP CONSTRAINT IF EXISTS learning_groups_status_chk,
  ADD CONSTRAINT learning_groups_status_chk CHECK (status IN (
    'draft', 'scheduled', 'recruiting', 'active', 'in_progress', 'exam', 'documents',
    'completed', 'closed', 'archived', 'cancelled')) NOT VALID;
CREATE INDEX IF NOT EXISTS groups_tenant_status_starts_idx ON learning.groups (tenant_id, status, starts_at);
CREATE INDEX IF NOT EXISTS groups_tenant_exam_date_idx ON learning.groups (tenant_id, exam_date) WHERE exam_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_tenant_ends_idx ON learning.groups (tenant_id, ends_at);
CREATE INDEX IF NOT EXISTS groups_tenant_responsible_idx ON learning.groups (tenant_id, responsible_user_id) WHERE responsible_user_id IS NOT NULL;
```

- [x] **Step 4: Зелёный.**
- [x] **Step 5: Commit** `feat(backend): миграция 0104 — расширение learning.groups (Фаза 1, срез 0)`.

### Task 2: 0105 — внешние ключи на `learning.groups`, снятие мёртвых FK (РМ31)

**Files:**

- Create: `apps/backend/migrations/0105_learning_group_fks_to_groups.sql`
- Modify: тест задачи 1.

- [x] **Step 1: Тест**: 0105 содержит `DROP CONSTRAINT IF EXISTS` для каждого из: `enrollments_group_id_fkey`, `enrollments_group_tenant_fk`, `learning_enrollments_learner_id_fkey`, `group_courses_group_id_fkey`, `group_courses_group_tenant_fk`, `group_courses_course_id_fkey`, `group_courses_course_tenant_fk`, `group_courses_course_version_id_fkey`, `group_courses_course_version_tenant_fk`, `generated_documents_group_id_fkey`, `generated_documents_group_tenant_fk`, `generated_documents_template_id_fkey`, `generated_documents_template_tenant_fk`, `generated_documents_template_version_id_fkey`, `exam_results_test_id_fkey`, `exam_results_test_tenant_fk`, `exam_results_best_attempt_id_fkey`, `exam_results_best_attempt_tenant_fk`; и три `REFERENCES learning.groups (tenant_id, id) NOT VALID` (`enrollments_group_tenant_fk`, `group_courses_group_tenant_fk`, `generated_documents_group_tenant_fk`); колонка `group_courses.teacher_user_id`; `learning_enrollments_status_chk` (0014, без `suspended`) снят.
- [x] **Step 2: красный.**
- [x] **Step 3: Миграция** — комментарий-шапка объясняет РМ31 и перечисляет снятые ключи с исходной миграцией; далее `ALTER TABLE … DROP CONSTRAINT IF EXISTS …` попарно и `ADD CONSTRAINT … FOREIGN KEY (tenant_id, group_id) REFERENCES learning.groups (tenant_id, id) NOT VALID`; `ALTER TABLE learning.group_courses ADD COLUMN IF NOT EXISTS teacher_user_id text;`.
- [x] **Step 4: зелёный.**
- [x] **Step 5: Commit** `feat(backend): миграция 0105 — ключи горячих таблиц на learning.groups, снятие мёртвых FK (РМ31)`.

### Task 3: 0106 — `learning.learners` (шифртекст + §17) и `crm.counterparties` (§17)

**Files:** Create `apps/backend/migrations/0106_learners_and_counterparties_extend.sql`; тест задачи 1.

- [x] **Step 1: Тест**: `learners` — колонки `snils_enc, snils_hash, email_enc, phone_enc, birth_date_enc, organization_unit_id, gender, birth_place, citizenship, registration_address, education_level, passport_enc, passport_hash, diploma, tracking_number, delivery_method, extra_fields, consent_status, photo_file_id, login, last_login_at, position_id`; индексы `learners_tenant_snils_hash_idx (tenant_id, snils_hash) WHERE snils_hash IS NOT NULL`, `learners_tenant_counterparty_idx`, `learners_tenant_status_idx`; `COMMENT ON COLUMN learning.learners.date_of_birth` и `... .snils` со словом `deprecated`. `counterparties` — колонки `short_name, ogrn, okpo, okato, oktmo, okogu, okopf, okved, postal_address, actual_address, region, city, postal_code, fax, director_name, director_position, manager_user_id, contract_date, contract_number, branding` (jsonb); индексы `counterparties_tenant_inn_idx (tenant_id, inn) WHERE inn IS NOT NULL`, `counterparties_tenant_manager_idx (tenant_id, manager_user_id) WHERE manager_user_id IS NOT NULL`.
- [x] **Step 2–5** как выше. Commit `feat(backend): миграция 0106 — колонки ПДн-шифртекста и §17 у learners и counterparties`.

### Task 4: 0107 — `learning.enrollments` + `enrollment_status_history`

**Files:** Create `apps/backend/migrations/0107_learning_enrollments_extend.sql`; тест задачи 1.

- [x] **Step 1: Тест**: колонки `result_code, certificate_number, certificate_series, protocol_number, protocol_date`; `enrollments_result_code_chk CHECK (result_code IS NULL OR result_code IN ('passed','failed','absent'))`; индексы `enrollments_tenant_group_idx, enrollments_tenant_learner_idx, enrollments_tenant_status_idx, enrollments_tenant_planned_end_idx`; `enrollments_completed_payload_chk` (0003, требует `completion_state`) снимается — у `Enrollment` в коде нет такого поля (РМ31); `enrollment_status_history` получает индекс `enrollment_status_history_tenant_enrollment_idx (tenant_id, enrollment_id, changed_at)`.
- [x] **Step 2–5.** Commit `feat(backend): миграция 0107 — расширение learning.enrollments (§17)`.

### Task 5: 0108 — `assessment.exam_results` и `documents.generated_documents`

**Files:** Create `apps/backend/migrations/0108_exam_results_and_generated_documents_extend.sql`; тест задачи 1.

- [x] **Step 1: Тест**: `exam_results`: `final_score DROP NOT NULL`, колонки `attempts_count integer NOT NULL DEFAULT 0, best_score numeric(8,2), max_score numeric(8,2), passing_score numeric(8,2)`, индекс `exam_results_tenant_learner_idx (tenant_id, learner_id)`. `generated_documents`: колонки `kind_code, series, rank, document_type, name, pdf_file_id, archived_at, protocol_document_id, enrollment_id, tracking_number`; сняты `generated_documents_status_chk` (0002) и `documents_generated_documents_status_chk` (0014); новый `generated_documents_status_chk CHECK (status IN ('draft','generated','final','issued','archived','revoked','cancelled','void'))`; индексы `generated_documents_tenant_learner_idx`, `generated_documents_tenant_group_idx`, `generated_documents_tenant_kind_date_idx (tenant_id, kind_code, document_date)`, `generated_documents_tenant_valid_until_idx (tenant_id, valid_until) WHERE valid_until IS NOT NULL`.
- [x] **Step 2–5.** Commit `feat(backend): миграция 0108 — расширение exam_results и generated_documents (§17)`.

### Task 6: 0109 — поиск: `pg_trgm` и trgm-индексы (РМ33)

**Files:** Create `apps/backend/migrations/0109_normalized_search_trgm_indexes.sql`; тест задачи 1.

- [x] **Step 1: Тест**: `CREATE EXTENSION IF NOT EXISTS pg_trgm` внутри `DO $$ … EXCEPTION WHEN OTHERS THEN RAISE NOTICE`; индексы создаются в `DO`-блоке под условием `EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')`: `counterparties_name_trgm_idx` (`gin (name gin_trgm_ops)`), `learners_full_name_trgm_idx` (`gin ((last_name || ' ' || first_name || ' ' || coalesce(middle_name, '')) gin_trgm_ops)`), `groups_name_trgm_idx`, `groups_code_trgm_idx`, `generated_documents_number_trgm_idx`.
- [x] **Step 2–5.** Commit `feat(backend): миграция 0109 — pg_trgm и индексы поиска (РМ33)`.

### Task 7: интеграционный тест на живой базе (полная цепочка) + EXPLAIN (МГ-A4.1)

**Files:**

- Create: `apps/backend/src/infrastructure/database/phase-1-normalized-tables.integration.test.ts`

- [x] **Step 1: Тест** — `describe.skipIf(!isDockerAvailable())`; `withTestDb({ migrations: allMigrationFiles() }, …)` где `allMigrationFiles()` читает каталог миграций отсортированно (как `migration-bootstrap.full-chain.test.ts`). Внутри одной транзакции: вставить `core.tenants` строку, `crm.counterparties`, `learning.learners` (с `snils_enc`/`snils_hash`, без открытого СНИЛС), `learning.groups` со статусом `closed`, `learning.group_courses` (course_id произвольный — FK снят), `learning.enrollments` (learner отсутствует в `core.users` — должно пройти; status `suspended`), `learning.enrollment_status_history`, `assessment.exam_results` без `final_score`, `documents.generated_documents` со статусом `archived` без `template_id` в `documents.templates`. Отдельный `it`: вставка зачисления с несуществующей группой отклоняется (`23503`). Отдельный `it`: на ~2000 синтетических групп (`generate_series`) `EXPLAIN (FORMAT JSON) SELECT … WHERE tenant_id=$1 AND status=$2 ORDER BY starts_at LIMIT 50` не содержит `"Node Type": "Seq Scan"` для `groups`.
- [x] **Step 2:** запустить (`pnpm --filter @trudskill/backend exec vitest run src/infrastructure/database/phase-1-normalized-tables.integration.test.ts --no-file-parallelism`), убедиться в зелёном; при красном чинить миграции, не тест.
- [x] **Step 3: Commit** `test(backend): Фаза 1 срез 0 — вставка в нормализованные таблицы и EXPLAIN на живой базе`.

### Task 8: документация и сторожа

**Files:**

- Modify: `docs/mvp-domain-database.md` (раздел «Фаза 1: нормализованные таблицы горячих коллекций» — таблица «коллекция → таблица → миграции»), `docs/TZ_UI_REDESIGN_STATUS.md` (журнал расхождений: слепая зона — `mvp-domain-migrations.test.ts` ищет FK регексом по тексту всей цепочки и не заметит снятия ключа), `docs/TZ_CDOPROF_MIGRATION_STATUS.md` (РМ31–РМ33, «Где мы сейчас», очередь), `LMS_AGENT_HANDOFF.md` §5.558, `README.md` §2, `CLAUDE.md` («Latest is `0109_…`»).

- [x] **Step 1:** правки документов.
- [x] **Step 2:** `pnpm ci:check` зелёный.
- [x] **Step 3:** commit `docs: Фаза 1 срез 0 — handoff §5.558, трекер, РМ31–РМ33`, PR.

---

## Дорожная карта срезов Фазы 1 (каждый — отдельный план и PR ≤30 файлов)

| Срез              | Содержание                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Точка отката                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **0** (этот план) | Миграции 0104–0109.                                                                                                                                                                                                                                                                                                                                                                                                                                              | Таблицы пусты; код не трогает.                                       |
| **0b**            | Бэкфилл «снимок → таблицы»: домен `lms_normalized` в `migration/backfill` (маппинг сущность → строка с перешифровкой ПДн, хэш по каноническим полям, отчёт `reconciliation_reports`), интеграционный тест на `withTestDb`.                                                                                                                                                                                                                                       | Таблицы можно очистить; снимок не меняется.                          |
| **1**             | `CounterpartiesRepository`, `GroupsRepository` (интерфейс, pg, память); проекция в `saveFromState` внутри транзакции снимка (упсерт изменённых сущностей — нужны отпечатки на уровне сущности); чтение `listGroups`/`listCounterparties`/карточек через SQL при `LMS_NORMALIZED_COLLECTIONS=groups,counterparties` (РМ32: значение `LMS_READ_MODEL=normalized` смысл не меняет); интерцептор не грузит снимок для таких GET (метаданные маршрута). k6 `/groups`. | `LMS_NORMALIZED_COLLECTIONS=` (пусто).                               |
| **2**             | `LearnersRepository` с шифрованием (`snils_enc`, `snils_hash`), `findLearnersBySnils` по хэшу, `q` — trgm по ФИО + точный СНИЛС; `learner-pii.service`. Контракт `q` сужается до ФИО/кода/СНИЛС — записать в журнал расхождений.                                                                                                                                                                                                                                 | то же                                                                |
| **3**             | `EnrollmentsRepository` + история; anti-IDOR и скоуп заказчика в SQL; госреестры с `page_size` 1000; `tenant-usage` (биллинг начнёт считать реальные зачисления).                                                                                                                                                                                                                                                                                                | то же                                                                |
| **4**             | `GroupCoursesRepository`, `ExamResultsRepository`.                                                                                                                                                                                                                                                                                                                                                                                                               | то же                                                                |
| **5**             | `generatedDocuments` в домене документов (`DOCUMENTS_READ_MODEL`), `GET /documents` через SQL, QR через индекс, дубли через UNIQUE; убрать `documents.generated_documents` из `DEAD_ON_PURPOSE` в `constraints-on-live-tables`.                                                                                                                                                                                                                                  | `DOCUMENTS_READ_MODEL=legacy`                                        |
| **6.x**           | Запись через репозитории по коллекции: async-цепочка `MvpService` → контроллеры (13) → раннер (22) → тесты (`new MvpService(` в 36 файлах); геттер исключённой коллекции бросает ошибку, а не отдаёт `[]`; сначала переводятся читатели «всей коллекции» (поиск, дашборды, закрытие группы, госреестры).                                                                                                                                                         | Возврат коллекции в снимок (запись в обе стороны в 6.x сохраняется). |
| **7**             | Отключение записи в снимок, `VALIDATE CONSTRAINT`, `docs/environment-and-config.md`, итоговый k6 (МГ-A3.1 p95 ≤ 500 мс).                                                                                                                                                                                                                                                                                                                                         | Последний обратимый шаг перед Фазой 2.                               |

**Главные риски** (из разведки §5.558): замок арендатора и версия состояния (запись мимо `bumpTenantStateVersion` даёт гонку — поэтому на срезах 1–5 запись только проекцией внутри транзакции снимка); атомарность интерцептора (репозитории должны писать в той же транзакции, что и снимок); синхронный API `MvpService`; «тихая пустота» исключённой коллекции; выдача документов (`runDetached`, дубли по полному списку); дрейф контракта `q`/`sort` (белый список сортировок с добивкой по `id`, `total` отдельным `count`).
