# Фаза 1 «Слой хранения», срез 2: слушатели — проекция при сохранении и чтение через SQL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **двумя PR**: 2a (задачи 1–3, проекция, поведение снаружи не меняется) и 2b (задачи 4–8, чтение под флагом).

**Goal:** Коллекция `learners` живёт в `learning.learners` по-настоящему: сохранение снимка проецирует изменённых слушателей (ПДн только шифртекстом и слепым индексом, учётная запись — по контексту `iam.users`), а `GET /learners`, `/learners/:id`, `/learners/lookup` читаются из SQL под флагом `LMS_NORMALIZED_COLLECTIONS=learners` с поиском по ФИО (триграммы 0109), табельному номеру и точному СНИЛС по `snils_hash`. Портал заказчика (`portal/learners`) остаётся на снимке до среза 3 (РМ37).

**Architecture:** Повторяет срез 1 (§5.560–§5.561) с тремя отличиями по разведке (§5.562): (1) в памяти слушатель расшифрован, а `projectEntity('learners')` шифрует заново (случайный IV — шифртекст не идемпотентен, но `changedEntities` сравнивает расшифрованный JSON, поэтому перешифровываются только изменённые; сверка «снимок ↔ таблица» должна сравнивать `snils_hash`/расшифрованные значения, не `*_enc`); (2) проекции нужен контекст учётных записей — `loadUserIds` рядом с `loadCounterpartyIds`, иначе `user_id`, проставленный бэкфиллом, обнулится; (3) чтение из репозитория отдаёт `enc:` — расшифровка `decryptLearnerPiiAtRest` в `MvpNormalizedReadsService` до `maskLearnerRow` контроллера (иначе маска возьмёт цифры из шифртекста). Скоуп представителя заказчика идёт через зачисления и группы, а `learning.enrollments` наполняются только бэкфиллом — поэтому `portal/learners` без `@ReadsNormalized` до среза 3.

**Tech Stack:** NestJS, `pg`, `pii-crypto.ts` (`encryptLearnerPiiAtRest`, `decryptLearnerPiiAtRest`, `snilsBlindIndex`), `normalizeSnils` (`snils.util.ts`), vitest, testcontainers, k6.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.1 («learners → learning.learners, ПДн шифруются в колонках как в 0061»), МГ-A1.2, МГ-A2.1 («`q` — ILIKE/pg_trgm по ФИО, коду и номеру, плюс слепой индекс СНИЛС»), МГ-A3.1 (`/learners` p95 ≤ 500 мс). Дорожная карта — [slice-0](./2026-09-23-cdoprof-migration-phase-1-slice-0-migrations.md); образец — [slice-1](./2026-09-23-cdoprof-migration-phase-1-slice-1-groups-counterparties.md).

## Global Constraints

- ПДн в открытом виде в таблицу не пишутся (`snils/email/phone/birth_date/date_of_birth` NULL); в ответах ручек — как у снимка: `maskLearnerRow` контроллера маскирует `snils`, остальное отдаётся как сейчас (существующее поведение не «чинить» молча — записать в журнал).
- `MvpService` не трогать; ЕСИА (`esia.service.ts`) и массовый импорт остаются на снимке — они пишут в состояние (6.x).
- SQL: `tenant_id` буквально в тексте (в том числе в `exists`), белый список сортировок `LEARNER_SORT_COLUMNS` (`lastName, firstName, middleName, learnerNo, status, createdAt, updatedAt, id`), `order by …, id asc`, `total` отдельным `count(*)`, выражение поиска по ФИО ровно как в индексе 0109: `(last_name || ' ' || first_name || ' ' || coalesce(middle_name, ''))`.
- Флаг: `NORMALIZABLE_COLLECTIONS` += `learners`; `.env.example`/`docs/environment-and-config.md` — допустимые значения.
- ≤30 файлов на PR, зелёный `pnpm ci:check`; k6 «после» в 2b.

## Review Focus

1. Стирание ПДн по 152-ФЗ (`erasePersonalData` → `Object.assign` в состоянии): проекция обнуляет `snils_enc/snils_hash/email_enc/phone_enc/birth_date_enc/user_id` в таблице — интеграционный тест 2a; отказ проекции этой строки (дубль `learner_no`) оставил бы шифртекст в таблице — тест на запись в журнал `projection_failed` с `entity_id`.
2. Два слушателя с одним `linkedIamUserId` → отказ по `learners_tenant_user_uniq_idx` поимённо, снимок сохранён.
3. `q=112-233-445 95` (и `11223344595`) находит слушателя по `snils_hash`; `q=112-233` (частичный) — не находит (дрейф записан, РМ38).
4. `GET /learners` из SQL: `snils` в ответе замаскирован так же, как из снимка; `email` открыт как сейчас; `snilsHash` в ответе отсутствует.
5. Открытые ПДн в снимке (`markDirty`) → `changedEntities('learners') = 'all'` → полный upsert ~14 000 строк под замком центра один раз; замерить в интеграционном тесте на 2 000 строк, что это секунды, не минуты.

---

## PR 2a — проекция слушателей при сохранении

### Task 1: контекст учётных записей и проекция

**Files:** Modify `normalized-upsert.ts` (`loadUserIds(client, tenantId, ids): Promise<Set<string>>` — `select id from iam.users where tenant_id = $1 and id = any($2::text[])`), `normalized-backfill.service.ts` (использует `loadUserIds`), `in-memory-mvp.state.ts` (`PROJECTED_COLLECTIONS = ['counterparties', 'groups', 'learners']`), `postgres-mvp-persistence.backend.ts` (`projectChanged`: шаг слушателей между контрагентами и группами — `ctx.users = await loadUserIds(...)` по `linkedIamUserId` изменённых; удаления слушателей после групп — на них ссылаются зачисления/документы таблиц, отказ → журнал), `postgres-mvp-persistence.backend.test.ts` (`isProjectionWrite` += `learning.learners`; мок отвечает `{ rows: [], rowCount: N }`; тест: параметры upsert не содержат открытого СНИЛС, `snils_hash` — 64 hex; стирание → `null` в колонках ПДн), `lazy-state.perf.test.ts` (`changedEntities('learners')` на неразложенной коллекции не раскладывает её).

- [x] Тесты → реализация. Commit `feat(backend): проекция слушателей в learning.learners при сохранении снимка — ПДн шифртекстом, учётная запись по контексту`.

### Task 2: интеграционный тест проекции слушателей

**Files:** Create `postgres-mvp-persistence.learners-projection.integration.test.ts` (withTestDb, вся цепочка): сохранение слушателя с открытым СНИЛС → в таблице `snils` NULL, `snils_enc` `enc:`, `snils_hash` = `snilsBlindIndex`; правка почты → перешифрована только она (сравнить `snils_enc` до/после — не изменился, т.к. сущность изменилась целиком → изменился; проверять по `snils_hash` и расшифровке); `linkedIamUserId` на существующего `iam.users` → `user_id`; на несуществующего → NULL + `payload.linkedIamUserId`; два слушателя с одним `user_id` → один в журнале; стирание ПДн → колонки NULL; `markDirty` на 2 000 строк → полный upsert < 15 с.

- [x] Commit `test(backend): проекция слушателей на живой базе — ПДн, учётные записи, стирание, полный upsert`.

### Task 3: документация 2a

**Files:** трекер (РМ37 — портал на снимке до среза 3), handoff §5.562, README, `docs/mvp-domain-database.md`, план (галочки). `pnpm ci:check`, PR.

---

## PR 2b — чтение слушателей через SQL под флагом

### Task 4: репозиторий слушателей

**Files:** Create `repositories/learners.repository.ts` (интерфейс + токен: `list(tenantId, query)`, `get(tenantId, id)`, `lookup(tenantId, query)`, `findBySnils(tenantId, snils): Promise<Learner[]>`), `postgres-learners.repository.ts` (`LEARNER_SORT_COLUMNS`; `q`: если `/^[\d\s-]+$/` и `normalizeSnils(q).length === 11` → `snils_hash = $n` (`snilsBlindIndex`), иначе `(<ФИО как в 0109> ilike $n or coalesce(learner_no, '') ilike $n)`; `status`; ответ — `rowToEntity('learners')` **без** расшифровки — расшифровывает сервис), `in-memory-learners.repository.ts` (поиск по ФИО/номеру/точному СНИЛС, сортировка по белому списку), `repositories.integration.test.ts` (+ слушатели: trgm по ФИО без учёта регистра, номер, точный СНИЛС в двух написаниях, частичный СНИЛС — пусто, изоляция, `get` чужого → null, lookup).

- [x] Commit `feat(backend): репозиторий слушателей — поиск по ФИО, номеру и слепому индексу СНИЛС`.

### Task 5: сервис чтения, флаг, декоратор, контроллер

**Files:** Modify `mvp-normalized-reads.service.ts` (`listLearners/getLearner/lookupLearners` + `findLearnersBySnils`; `decryptLearnerPiiAtRest` на каждой сущности списка и карточки; 404 `not_found` как у снимка), `mvp-normalized-reads.service.test.ts` (третий репозиторий; расшифровка: в ответе открытый СНИЛС и нет `snilsHash`), `normalized-collections.ts` + тест (`learners`), `mvp.controller.ts` (`learners`, `learners/lookup`, `learners/:id` — ветка + `@ReadsNormalized('learners')`; `maskLearnerRow` остаётся; `portal/learners` НЕ трогать — РМ37), `mvp.module.ts` (фабрика `LEARNERS_REPOSITORY`), `.env.example`, `docs/environment-and-config.md`.

- [x] Commit `feat(backend): /learners читается из learning.learners под флагом — расшифровка до маскирования`.

### Task 6: замер «после» (МГ-A3.1)

- [x] Перф-стенд `:3091` (`LMS_NORMALIZED_COLLECTIONS=groups,counterparties,learners`), бэкфилл уже сделан (§5.561; повторить `pnpm backfill:normalized` — повторяем), `run-k6.sh`; цель: `/groups` и `/learners` p95 ≤ 500 мс при VUS=10 (`/search` — ещё снимок). Результат — `docs/LOAD_TEST_RESULTS.md`.

### Task 7: документация 2b

**Files:** трекер (РМ38 — поиск слушателей; МГ-A2.1/A3.1), журнал расхождений (сужение `q`: почта/телефон/частичный СНИЛС; `group_id` игнорируется; `maskLearnerRow` не маскирует `dateOfBirth/email/phone` — существующее поведение, класс «дефект UX/ПДн» на решение), handoff §5.563, README, CLAUDE.md, план. `pnpm ci:check`, PR.

## Риски (из разведки)

- Дубли `learnerNo` не проверяются при создании — отказ проекции поимённо, таблица отстаёт для этой строки (в т. ч. стирание ПДн): тест + запись в журнал; проверку уникальности при создании — в журнал как дефект логики снимка.
- Ротация ключа HMAC меняет `snils_hash`: поиск по хэшу не найдёт строки со старым ключом до перепроекции — runbook владельцу при ротации (бэкфилл повторяем).
- `'all'` для слушателей (открытые ПДн в старом снимке) — один полный upsert на центр; при одной плохой строке — построчно под замком центра.
- `revealPersonalData` читает `learner.birthDate`, которого у `Learner` нет — существующий дефект, в журнал.
