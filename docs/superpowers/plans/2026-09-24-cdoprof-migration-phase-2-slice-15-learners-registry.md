# Реестр слушателей (МГ-C3.2) — Фаза 2, срезы 11.1–11.3 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** ТЗ перехода §6.4 МГ-C3.2 [P0]: реестр слушателей — колонки «Компания», «Группа (текущая)», «Последний вход», «Согласие ПДн»; фильтры компания, группа, статус, «без email», «не входил»; массово: в группу ✔, выслать доступы, выгрузить XLSX, архивировать ✔; сохранённые представления на сервере (МГ-H4.1).

**Architecture:** Разведка (§5.594): `GET /learners` читает только `q/status/sort`, «текущая группа» нигде не считается, «последний вход» есть только в журнале группы (8.8, `iam.sessions`), согласие видно только самому слушателю (`identity.read`), представления — `localStorage`, XLSX реестра нет (только шаблон импорта), сторожа бюджета ≤7 колонок нет. Три среза:

- **11.1 (бэкенд):** `LearnersListQuery` (компания `client_id`, группа `group_id`, `no_email`, `never_logged_in`) в Postgres и памяти; `registryDetails(ids)` — четыре запроса по странице (компания, текущая группа `distinct on` по незавершённым зачислениям, последний вход `max(iam.sessions.created_at)`, согласие — последний факт `personal_data` не отозван) → `registry` в строке ответа; `GET learners/export.xlsx` (`learners.read`, до 5000 строк, подписи вместо кодов, СНИЛС маской).
- **11.2 (фронт):** колонки (по умолчанию ≤7: ФИО, почта, СНИЛС, должность, компания, группа, статус; последний вход и согласие — через выбор колонок), фильтры компания/группа в «Ещё фильтры» и переключатели «без почты»/«не входил» (видимых ≤3), массово «Выслать доступы» (по одному через `POST learners/:id/access/send`, отказы поимённо), «Выгрузить XLSX» с сервера с теми же фильтрами.
- **11.3 (МГ-H4.1):** миграция `reports.saved_views` (entity, name, filters, columns, sort, scope private/tenant), ручки `GET/POST/DELETE saved-views`, `saved-views.ts` реестров переводится с `localStorage` на сервер.

**Tech Stack:** NestJS, Postgres (`learning.learners/enrollments/groups`, `crm.counterparties`, `iam.sessions`, `learning.consent_facts`), `ReportXlsxWriter`, `@trudskill/ui` (`FilterBar.secondaryFilters`, `ColumnPicker`, `BulkActionBar`).

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.4 МГ-C3.2, §5 (реестр: поиск → быстрые отборы → фильтры), МГ-H1 (выгрузка: подписи, без id), МГ-H4.1; ТЗ редизайна §13.2 (≤7 колонок, ≤3 фильтра).

## Global Constraints

- Ручка и права списка не меняются; новые параметры и `registry` в строке — только добавления.
- Все новые SQL — с буквальным `tenant_id = $1` (сторож `tenant-scoped-reads`); `InMemoryLearnersRepository` зеркалит фильтры (режим без базы).
- Колонок по умолчанию ≤7, видимых фильтров ≤3; XLSX без идентификаторов.

## Решения (журнал РМ трекера)

- **РМ103.** Сведения реестра (компания, текущая группа, последний вход, согласие) — отдельным `registryDetails` по идентификаторам страницы, не соединением в списке; в снимке без базы сведений нет — колонки пустые, а не ложные.
- **РМ104.** «Текущая группа» — последнее по дате зачисление в статусах `pending/active/suspended`; «не входил» — учётки нет или ни одной сессии; «согласие» — последний факт `personal_data` без отзыва; показывается под `learners.read` как признак «действует/нет» без текста согласия.
- **РМ105.** Выгрузка XLSX — на сервере (`GET learners/export.xlsx`, до 5000 строк, те же фильтры), не сборка в браузере: подписи колонок и маски — из одного места с реестром.

## Review Focus

1. Фильтр «не входил» при слушателе с учёткой без сессий и при слушателе без учётки — оба попадают.
2. Слушатель с двумя зачислениями (одно отменено, одно активное) — текущая группа активная.
3. Страница без базы (`ALLOW_IN_MEMORY_STATE`) — реестр открывается, сведения пустые.
4. Выгрузка при фильтре по компании отдаёт только её слушателей, СНИЛС маской.
5. Представитель заказчика (скоуп) не видит чужих слушателей и в выгрузке.

---

## Task 1: бэкенд (срез 11.1)

**Files:** Create `infrastructure/repositories/learners-registry.ts`, `learners/learners-registry-export.service.ts` (+ тест); Modify `learners.repository.ts`, `postgres-learners.repository.ts`, `in-memory-learners.repository.ts` (+ тест), `mvp-normalized-reads.service.ts`, `mvp.dto.ts` (`no_email`, `never_logged_in`), `mvp.controller.ts` (`registry` в списке, `GET learners/export.xlsx`), `mvp.module.ts`.

- [x] Тесты → код → lint/typecheck → commit; документация §5.594; `pnpm ci:check`, PR, слияние.

## Task 2: фронт (срез 11.2)

**Files:** Modify `features/learners/{types,api,hooks,learners-list-screen}.tsx`, снимок MET-001; Create `features/learners/registry-labels.ts`.

- [x] Экран; сторожа; commit; документация §5.595.

## Task 3: представления на сервере (срез 11.3, МГ-H4.1)

**Files:** Create миграция `0114_reports_saved_views.sql`, `modules/reports/saved-views.*`; Modify `features/learners/saved-views.ts` (+ тест), `packages/ui/saved-views`.

- [x] Миграция 0114; модуль `saved-views` (свои/общие, предел 30); `features/saved-views`; реестр слушателей на сервере с разовым переносом из браузера; документация §5.596 (МГ-C3.2 ✅, МГ-H4.1 ✅ для слушателей).
