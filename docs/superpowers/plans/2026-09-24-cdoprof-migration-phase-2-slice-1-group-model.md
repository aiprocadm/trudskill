# Фаза 2 «Домен CDOPROF», срез 1: модель, статусы, автономер и фильтры группы (МГ-B1.1, B1.2, B3.1, B3.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **тремя PR**: 8.1 (бэкенд: модель, статусы, автономер, значения по умолчанию, проекция, серверные фильтры), 8.2 (ежедневный сканер автопереходов), 8.3 (экраны: чипы и подписи статусов, фильтры реестра, поля в форме и карточке).

**Goal:** Группа перестаёт быть «код + название + свободная строка статуса»: у неё поля CDOPROF (§4 ТЗ), статус из закрытого списка с машиной состояний, код по шаблону центра, значения по умолчанию из настроек центра, а реестр умеет серверные быстрые отборы. Всё — аддитивно: старые клиенты шлют `{code, name, status}` и работают как прежде.

**Architecture (по разведке §5.572).** Колонки для всех полей уже есть (0104), CHECK статусов уже включает восемь целевых и три старых значения. Поэтому миграции не нужно; работа — на сущности, DTO, сервисе, проекции и репозитории. Решения: (РМ45) канонический список статусов `draft → recruiting → in_progress → exam → documents → closed → archived` + `cancelled`; старые `scheduled/active/completed` принимаются на входе и трактуются как `recruiting/in_progress/closed` в машине состояний, но **хранимые значения не переписываются** (снимок и таблица не трогаем, старые чипы фронта живут до 8.3); новые записи получают только канонические значения. (РМ46) Ручной переход — на соседний по цепочке в обе стороны, `cancelled` — из любого до `closed`, `archived` — только из `closed`/`cancelled` (B6.2); переходы `exam → documents` и `documents → closed` до Фазы 3 доступны вручную (крючки выпуска протокола и пакета — Фаза 3). (РМ47) Автономер: шаблон `groupCodePattern` из настроек центра (по умолчанию `{YY}{WW}{NN}`), счётчик `NN` — порядковый в префиксе (минимальный свободный, при переполнении `NNN`), календарь и ISO-неделя — в часовом поясе центра; ручной код разрешён; `{direction.code}` — пусто, пока у группы нет направления (журнал). Значения по умолчанию — `org.tenant_settings.payload.groupDefaults` через чистый резолвер; настройки центра читает `GroupSettingsService` (контроллер, последний аргумент), а не `MvpService` (его конструктор собирают 36 тестов). Даты: `startDate/endDate/examDate/practiceFrom/To/materialsAccessUntil` — `YYYY-MM-DD`; `examAccessFrom/To/closedAt/archivedAt` — ISO-момент; в таблице `starts_at/ends_at/materials_access_until` — timestamptz (0013/0104) → пишутся из полей, обратно не читаются (скрытые колонки, исходник в `payload`).

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) §4 (группа), §6.1 (МГ-B1.1, B1.2, B3.1, B3.2), §16 (`GET/PATCH /groups` фильтры, `POST /groups/:id/status`, `POST /groups/:id/archive`), §17 (`learning.groups`, `groupDefaults`, `groupCodePattern`), §18 приёмка «Статусы группы».

## Global Constraints

- Контракты не ломать: `POST /groups` принимает прежнее тело; `PUT /groups/:id` остаётся (§16 называет PATCH — дрейф записан, не чинится молча).
- Валидация §4: `end ≥ start`; `exam ∈ [start; end + 30 дней]`; при `closed/archived/cancelled` правка дат, контрагента и кода запрещена (409 `group_closed`), комментарий — разрешён.
- Ошибка переходов — 409 `group_status_transition_invalid` с текстом «из какого в какой нельзя и какие можно».
- Сторожа: `permission-*` (новые ручки под `groups.write`), `route-shadowing` (новые пути после `groups/:id` — только с суффиксом), `tenant-scoped-reads`, `json-filters-indexed` (фильтры только по колонкам), `di-explicit-injection`; `ia-architecture` не затрагивается (маршрутов фронта нет).
- ≤30 файлов на PR, зелёный `pnpm ci:check` (в worktree во время прогона ничего не трогать).

## Review Focus

1. `POST /groups` без `code` — код по шаблону центра, уникальный; второй вызов в ту же неделю — следующий номер; 100-я группа недели — три знака.
2. `POST /groups` с `status: 'active'` (старый клиент) — принимается, новая запись получает канонический `in_progress` (РМ45); у старых записей `active` в данных остаётся, и `updateGroup` со `status: 'exam'` из него разрешён как соседний.
3. `POST /groups/:id/status` из `recruiting` в `documents` — 409 с перечнем допустимых; в `cancelled` — 200; из `closed` в `cancelled` — 409.
4. `GET /groups?quick=exam_this_week` под флагом и без флага даёт один и тот же набор (снимок и SQL считают неделю в поясе центра).
5. Проекция группы с датами `start > end` (старые данные) — отказ поимённо в журнале сверки, снимок цел.

---

## PR 8.1 — бэкенд

### Task 1: чистые модули

**Files:** Create `apps/backend/src/modules/mvp/groups/group-status.ts` (+ `.test.ts`): `GROUP_STATUSES`, `normalizeGroupStatus`, `assertGroupStatusTransition` (соседи, `cancelled`, `archived`), `isGroupLocked`, `GROUP_QUICK_FILTERS`, `filterGroups(groups, query, today)` (общая семантика для снимка и памяти); `groups/group-code.ts` (+ `.test.ts`): `DEFAULT_GROUP_CODE_PATTERN`, `isoWeek`, `renderGroupCode`, `generateGroupCode`; `groups/group-defaults.ts` (+ `.test.ts`): ключи настроек, `resolveGroupDefaults`, `resolveGroupCodePattern`, `applyGroupDefaults`.

- [ ] Commit `feat(backend): статусы, автономер и значения по умолчанию группы — чистые модули (Фаза 2, срез 8.1)`.

### Task 2: сущность, DTO, сервис, контроллер

**Files:** Modify `mvp.types.ts` (`GroupEntity` + поля §4, тип `GroupStatus`), Create `mvp/groups/group.dto.ts` (`CreateGroupRequest`, `UpdateGroupRequest`, `SetGroupStatusRequest`), `mvp/groups/group-settings.service.ts` (настройки центра → шаблон и значения по умолчанию, `@Optional() TenantService`), Modify `mvp.service.ts` (`createGroup` с генерацией кода и валидацией, `updateGroup` с проверкой перехода и блокировкой закрытой, `setGroupStatus`, `archiveGroup`, `listGroups` с `filterGroups`), `mvp.controller.ts` (DTO, `POST groups/:id/status`, `POST groups/:id/archive`, `GroupSettingsService` последним), `mvp.module.ts`, `mvp.learner-documents.controller.test.ts`, `mvp.service.test.ts`, `mvp.dto-validation.test.ts`.

- [ ] Commit `feat(backend): модель, статусы и автономер группы в сервисе и ручках (Фаза 2, срез 8.1)`.

### Task 3: проекция и SQL-фильтры

**Files:** Modify `normalized-projection.ts` (`TABLE_SPECS.groups` — все колонки 0104, `projectGroup`, скрытые `starts_at/ends_at/materials_access_until`, пометки `__synthesized` для `is_dot/remote_signature/require_identity`), `normalized-projection.test.ts`, `repositories/groups.repository.ts` (`GroupListQuery`), `postgres-groups.repository.ts` (`parseGroupListQuery`, фильтры по колонкам, быстрые отборы), Create `repositories/in-memory-groups.repository.ts`, Modify `mvp-normalized-reads.service.ts`, `mvp.module.ts`, `mvp.domains.http.integration.test.ts`, `mvp-normalized-reads.service.test.ts`, `repositories.integration.test.ts`.

- [ ] Commit `feat(backend): поля группы в таблице и серверные отборы реестра (Фаза 2, срез 8.1)`.

### Task 4: документация 8.1

handoff §5.572, трекер (позиция 8 🔄, МГ-B1.1/B1.2/B3.1 🔄→✅ по бэкенду, B3.2 бэкенд ✅ / фронт 8.3, РМ45–РМ47), README, CLAUDE, журнал (PUT vs PATCH §16; `{direction.code}` без источника; подписи статусов на фронте — до 8.3). `pnpm ci:check`, PR.

## PR 8.2 — сканер (план после 8.1)

`mvp/groups/group-status.scanner.service.ts` (чистый `scanTenant(asOf, state)`: `recruiting → in_progress` в `startDate` при ≥1 активном зачислении; `in_progress → exam` в `examAccessFrom`/`examDate`), `group-status.scheduler.service.ts` (`GROUP_STATUS_SCAN_ENABLED`, `GROUP_STATUS_CRON_SCHEDULE`, замок `528_498`, `runWithTenantStateAndSave`, `declareScheduler`), env, тесты по образцу `expired-attempts`.

## PR 8.3 — экраны (план после 8.2)

Подписи и тона восьми статусов (UI-023), фильтр статуса и быстрые отборы в `groups-list-screen.tsx`, поля §4 в форме создания/дровере и в «Сводке» карточки, ручки статуса в «…», `routes.md` без изменений.

## Риски (из разведки)

- DTO `CreateSimpleRegistryRequest` общая с контрагентами/слушателями/направлениями — для группы свой DTO, общую не трогать.
- Старые значения статусов в данных остаются; фронт до 8.3 показывает их прежними подписями; новые статусы без подписи покажутся латиницей — поэтому 8.3 идёт следом, а фронт `group-create-screen` шлёт `status: 'draft'` (совместимо).
- CHECK `learning_groups_starts_before_ends_chk` действует на новые строки: валидация дат в сервисе обязательна, а старые группы с плохими датами упадут в `projection_failed` поимённо.
