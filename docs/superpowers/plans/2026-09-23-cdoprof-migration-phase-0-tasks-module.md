# Модуль `tasks` на бэкенде — план (позиция 5 очереди)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Дата:** 2026-09-23. **ТЗ:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §4 (Задача, Комментарий), §5.4 МГ-G2.1–G2.2, §11 (уведомления `task_*`), §12 (матрица прав), §16 (ручки `/tasks`), Часть VI п. 5 (PR-5).
**Трекер:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md`, позиция 5. **Апрув:** делегирован (поручение владельца 23.09.2026).

**Goal:** Задачи сотрудников (замена «календаря задач» CDOPROF) как первый модуль, живущий СРАЗУ в нормализованных таблицах `tasks.*` (миграция 0101) через репозиторий — образец для Фазы 1; ручки §16 с правами `tasks.read/write/manage_all`; без фронтенда (он — позиция 6).

**Architecture:** `modules/tasks/` по образцу `org/licenses`: `tasks.types.ts` → `tasks.repository.ts` (токен + интерфейс) → `postgres-tasks.repository.ts` (SQL, все запросы с `tenant_id`, многошаговые записи под `withTransaction`) и `in-memory-tasks.repository.ts` (тесты) → `tasks.service.ts` (правила §4/§5.4: переходы статусов, кто что может, аудит `writeCritical`) → `tasks.dto.ts` (class-validator) → `tasks.controller.ts` (`@Controller('tasks')`, `TenantGuard` + `PermissionGuard`, `assertValidDto`) → `tasks.module.ts` (регистрируется в `domainModules` ПОСЛЕ `WorkspaceModule`, у которого уже есть `GET /tasks/inbox`). Миграция `0103_iam_tasks_permissions.sql` — три права с раздачей ролям.

**Tech Stack:** NestJS 11, `pg` через `DatabaseService`, class-validator, vitest.

**Spec:** §16 строки 804–809 (ручки), §4 строки 418–419 (валидации), §5.4 строки 463–482 (сценарии).

## Global Constraints

- Право без ручки запрещено (`permission-coverage`): `tasks.manage_all` проверяется в сервисе → строка в `ENFORCED_ELSEWHERE` с указанием места.
- Каждая ручка под `@RequirePermissions` (`permission-surface`), каждое право из декоратора — в миграции (`permissions-exist`).
- POST/PATCH/DELETE не под `*.read` (`mutation-under-read-permission`) → комментарии пишутся под `tasks.write` (РМ24, отклонение от §16).
- Каждый `select/update/delete` по `tasks.*` содержит `tenant_id` (`tenant-scoped-reads`); список с `limit/offset` заканчивается `order by … id` (`paged-list-is-stable`); метод с ≥2 записями — под `withTransaction` (`multi-write-is-atomic`).
- Коды ошибок только `{code, message}` snake_case, один код — один статус (`error-code-declared`, `error-status-matches-code`).
- Снимок прав ролей `ROLE_RIGHTS_SNAPSHOT` (`common/testing/role-rights.test-util.ts`) обновляется вместе с миграцией — точное совпадение для `manager/methodist/teacher`.
- Всё, что число (окно удаления своего комментария — 15 мин по §4), — настройка со значением по умолчанию (`TASKS_COMMENT_DELETE_WINDOW_MINUTES`).
- Уведомления `task_*` (§11, P0) — позиция 11 «новые события и каналы» (РМ26): тройное согласие каталога/матрицы/кода делается там; сервис сейчас событий не шлёт.
- Проверка принадлежности связанных объектов (`groupId`, `learnerId`, `counterpartyId`) тенанту — отложена до Фазы 1 (РМ27): эти сущности живут в JSON-снимке, читать его из модуля задач значило бы грузить 25 МБ на каждое создание задачи; FK добавит Фаза 1 (РМ23).

## Review Focus

1. Чужая задача (другой тенант или не участник без `manage_all`) — `404 task_not_found`, а не 403: не раскрывать существование (тест изоляции в Task 5).
2. Переход, не разрешённый цепочкой `new → in_progress → done → confirmed`, или чужим актором — `409 task_status_transition_invalid` / `403 task_action_forbidden` (тесты сервиса).
3. `return` без комментария — `400 validation_error`; `due < start` при создании, правке и переносе — `400 validation_error`.
4. `GET /tasks?filter=all` без `manage_all` — `403 task_filter_all_forbidden`; `assignee=` без `manage_all` — то же.
5. `POST /tasks/bulk` — частичный успех: одна упавшая строка не отменяет остальные; в ответе поимённо `{taskId, status, error}`.

---

### Task 1: миграция прав + снимок ролей + реестр сторожа

**Files:** `apps/backend/migrations/0103_iam_tasks_permissions.sql`; `common/testing/role-rights.test-util.ts` (manager +read/write/manage_all; methodist, teacher +read/write); `common/guards/permission-coverage.isolation.test.ts` (`tasks.manage_all` → ENFORCED_ELSEWHERE); `modules/tasks/migrations.0103.test.ts`.
Выдача (§3/§12, РМ25): `read`+`write` — всем сотрудникам (`platform_admin`, `tenant_admin`, `manager`, `methodist`, `teacher`, `curator`); `manage_all` — `platform_admin`, `tenant_admin`, `manager` («П (все)» руководителя).

### Task 2: типы, репозиторий (интерфейс, in-memory, postgres)

**Files:** `modules/tasks/tasks.types.ts`, `tasks.repository.ts`, `in-memory-tasks.repository.ts`, `postgres-tasks.repository.ts`, `postgres-tasks.repository.test.ts` (фейковая БД: SQL содержит `tenant_id`, вставка задачи + исполнителей + файлов в одной транзакции, список с `order by … id`).

### Task 3: сервис + DTO

**Files:** `tasks.service.ts`, `tasks.dto.ts`, `tasks.service.test.ts` (создание с исполнителями по умолчанию = автор; исполнитель не сотрудник → 400; переходы и роли; return без комментария; reschedule чужим → 403; manage_all видит всё; bulk частичный успех; окно удаления комментария), `tasks.dto-validation.test.ts`.

### Task 4: контроллер + модуль + контракт

**Files:** `tasks.controller.ts`, `tasks.module.ts`, `app.module.ts` (domainModules), `env.schema.ts` (`TASKS_COMMENT_DELETE_WINDOW_MINUTES`), `packages/api-contracts/src/domains/tasks.ts` (типы `StaffTask*` рядом с существующей заготовкой), `tasks.http.integration.test.ts` (настоящий контроллер, права: 401/403/200, конверт; `GET /tasks/inbox` остаётся за workspace).

### Task 5: изоляция + документы

**Files:** `tasks.isolation.test.ts`; трекер (позиция 5 ✅, МГ-G2.1–G2.2 ✅ по бэкенду, МГ-J1.2 🔄, РМ24–РМ27), handoff §5.556, README §2, CLAUDE.md («Latest is 0103»); `pnpm ci:check` → PR.
