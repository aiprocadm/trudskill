# Экран `/tasks` и роль куратора во фронте — план (позиция 6 очереди)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Дата:** 2026-09-23. **ТЗ:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §5.4 МГ-G2.3 (реестр задач), §II.3 (блок «Обзор», короткое меню куратора), §14 МГ-L1.1/L2.1/L3.1/L6.1/L7.1, МГ-J1.1 (куратор во фронте); ТЗ редизайна §7.1 `TPL-001`, §13.2 бюджеты, §15.1 чек-лист, §9 тексты, `TPL-006`, `UI-007`.
**Трекер:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md`, позиция 6. **Апрув:** делегирован.

**Goal:** Куратор (и любой сотрудник с `tasks.read`) видит свои задачи по `TPL-001`, ставит новые, работает с ними в дровере; роль `curator` появляется в меню, словаре ролей и снимках сторожей.

**Architecture:** Два шага в одном PR (≤30 файлов), чтобы экран не показывал сырые id (сторожа `id-output-ban`/`raw-id-values-ban`): (1) **бэкенд** — в ответе задач имена участников (`assignees[].name`, `creatorName` из `iam.users.display_name`) и ручка `GET /tasks/staff?q=` под `tasks.write` (выбор исполнителя: `{id, name}`, ≤20 строк); (2) **фронт** — `features/tasks/{types,api,hooks,tasks-list-screen,task-drawer}.tsx` + `app/tasks/page.tsx` (`ListPage`, `DetailDrawer`, `ConfirmDialog`, `BulkActionBar`), навигация (`model.ts`, `nav-groups.ts` → `overview`, `role-blueprints.ts` куратор ≤7, `role-home.ts`, `top-job-routes.ts`), роль (`roles.ru.ts`, `DECISION_P1`, `role-permissions.fixture.ts` + `tasks.*` всем сотрудникам), документы (`docs/ia/routes.md`, `roles.md`), снимки сторожей (`role-menu-composition`, `role-blueprints.test`, `role-home.test`), бэкенд-снимок `role-rights.test-util.ts` (`curator` в `RoleCode` и `ROLE_RIGHTS_SNAPSHOT`).

## Global Constraints

- `page.tsx` ≤ 20 строк; заголовок `title="Задачи"` буквально в файле экрана; одно первичное действие («Поставить задачу»); ≤3 видимых фильтра; ≤7 колонок; `ConfirmDialog` для отмены; без сырых id и инлайн-цветов; 360px: `DataTable` → карточки.
- Все фильтры доходят до сервера (`filters-reach-the-server`): `filter, assignee, due_from, due_to, label, page, page_size`; смена отбора сбрасывает страницу.
- Экран, зовущий мутации, упоминает `'tasks.write'` (`action-needs-permission`).
- Куратор в чертеже меню — только существующие адреса: `/workspace`, `/groups`, `/learners`, `/admin/clients`, `/tasks`, `/reports`; домашний маршрут — `/workspace` до появления `/curator` (позиция 11).
- `roles-speak-russian`: проверка «посев по 0096» должна учитывать 0099 (роль заведена `INSERT`, не `UPDATE`) — правится сама проверка, а не обходится.
- Excel-выгрузка и автоархив (G2.3) — позиция 12 (отчёты) и планировщик Фазы 5; здесь — реестр, дровер, действия, комментарии, массовые «Выполнить»/«Перенести»/«Отменить».

## Review Focus

1. Пункт «Задачи» появляется у ролей с `tasks.read` и НЕ появляется у слушателя и представителя (снимок `role-menu-composition`).
2. `filter=all` показывается только при `tasks.manage_all` (иначе сервер ответит 403 и пользователь увидит непонятный отказ).
3. Дровер задачи показывает действия по роли актора: исполнителю «Взять в работу»/«Выполнить», постановщику «Подтвердить»/«Вернуть»/«Отменить»/«Перенести».
4. «Вернуть» без комментария не отправляется (обязательное поле в диалоге).
5. `GET /tasks/inbox` (workspace) не перехвачен маршрутом фронта `/tasks` — разные приложения, но `routeMeta` для `/tasks` не должен ловить `/tasks/inbox` (такой страницы во фронте нет — проверить `ia-architecture`).

---

### Task 1 (бэкенд): имена участников и поиск сотрудников

**Files:** `modules/tasks/tasks.types.ts` (+`name` у `TaskAssignee`, `creatorName` у `Task`), `tasks.repository.ts` (+`searchStaff(tenantId, q, limit)`, `findUserNames`), `postgres-tasks.repository.ts`, `in-memory-tasks.repository.ts` (сотрудники `{id, name}`), `tasks.service.ts` (`searchStaff`), `tasks.controller.ts` (`GET staff` выше `:id`), `packages/api-contracts/src/domains/tasks.ts`, тесты.

### Task 2 (фронт): feature `tasks`

**Files:** `src/features/tasks/{types.ts, api.ts, hooks.ts, tasks-list-screen.tsx, task-drawer.tsx, task-form.tsx, api.contract.test.ts}`, `app/tasks/page.tsx`.

### Task 3 (фронт): навигация и роль

**Files:** `features/navigation/{model,nav-groups,role-blueprints,role-blueprints.test,role-home,role-home.test,top-job-routes}.ts`, `features/texts/roles.ru.ts`, `e2e/{roles-speak-russian,role-menu-composition,role-permissions.fixture}.ts`, `apps/backend/src/common/testing/role-rights.test-util.ts`.

### Task 4: документы и сторожа

**Files:** `docs/ia/routes.md`, `docs/ia/roles.md`, `e2e/tasks-screen.e2e.test.ts`, трекер, handoff §5.557, README §2; `pnpm ci:check` → PR.
