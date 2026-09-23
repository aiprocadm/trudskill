# Аддитивные миграции без изменения поведения — план (позиция 4 очереди)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Дата:** 2026-09-23. **ТЗ:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §3 (роль `curator`), §4 (Задача, Импорт), §12 (матрица), §17 (база данных), МГ-J1.1, МГ-K2.1, МГ-G2 (схема), Часть VI п. 4 (PR-4).
**Трекер:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md`, позиция 4. **Апрув:** делегирован (поручение владельца 23.09.2026).

**Goal:** Подготовить базу к позициям 5–10, не меняя поведения: роль куратора в каждом центре, таблицы соответствий и журнала импорта, схема задач, внешние идентификаторы на доменных таблицах.

**Architecture:** Четыре SQL-миграции подряд (0099–0102 — следующие свободные номера, номера ТЗ — предложения), все `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, без `BEGIN/COMMIT` (раннер применяет каждый файл в своей транзакции). Кода и ручек нет — поведение не меняется по построению: роль без пользователей, таблицы без читателей, колонки в таблицах, которые приложение пока не читает.

**Spec:** §17 — дословные предложения по таблицам; §3/§12 — права куратора.

## Global Constraints

- Только добавление; исторические миграции не правятся (`migration-integrity` — контрольные суммы).
- Порядок файлов без дублей номеров (`mvp-domain-migrations.test.ts`), каждая таблица с `tenant_id … NOT NULL`, `created_at/updated_at`.
- **Право без ручки запрещено** сторожем `permission-coverage` → куратор получает только существующие коды; новые (`tasks.*`, `import.run`, …) — вместе с контроллерами (РМ21).
- Роль в базе не требует правок фронта: снимок `role-permissions.fixture.ts` статичен; чертёж меню, словарь `roles.ru.ts`, `docs/ia/roles.md` — позиция 6 (МГ-J1.1 остаётся 🔄).
- Проверка: `pnpm test:migrations`, полная цепочка `migration-bootstrap.full-chain.test.ts` (testcontainers), живое применение ДВАЖДЫ на копии базы `trudskill_perf` (идемпотентность), `pnpm ci:check`.

## Review Focus

1. `ALTER TABLE … ADD CONSTRAINT … CHECK` на мёртвых таблицах роняет `constraints-on-live-tables` — CHECK только внутри `CREATE TABLE` новых таблиц; на существующих — только колонки и индексы.
2. Внешние ключи на `learning.groups`/`learners`/`crm.counterparties` из `tasks.tasks` привязали бы задачи к таблицам, которые Фаза 1 перестраивает — ключи отложены (РМ23), индексы есть.
3. Повторное применение каждой миграции — ноль ошибок (все объекты `IF NOT EXISTS`, посев — `ON CONFLICT DO NOTHING`).
4. Новый центр получает роль копированием из центра администратора — если в нём роли нет (старые базы), скрипт посева всё равно заведёт её во всех центрах (`FROM core.tenants`).
5. `migration.legacy_ids` без `id`: первичный ключ — составной по источнику; целевой индекс — отдельно.

---

### Task 1: миграции 0099–0102

**Files:** `apps/backend/migrations/0099_iam_curator_role_and_seed.sql`, `0100_migration_legacy_ids_import_runs.sql`, `0101_tasks_schema.sql`, `0102_external_ids_on_domain_tables.sql`.

- [x] Файлы по образцу 0084/0091/0098 (шапка «зачем / что делаем», без BEGIN/COMMIT).
- [x] `pnpm test:migrations` зелёный; `migration-bootstrap.full-chain.test.ts` зелёный.
- [x] Живое применение на копии: `create database trudskill_perf_mig template trudskill_perf` → `psql -f` каждого файла дважды → 0 ошибок; проверка: роль `curator` в каждом центре с 16 правами, схемы `tasks`/`migration`, колонки на месте.

### Task 2: документы

- [x] `CLAUDE.md` («Latest is `0102_…`»), трекер (позиция 4 ✅, МГ-J1.1 🔄 «роль есть, фронт — позиция 6», МГ-K2.1 ✅ по схеме, МГ-G2 🔄 «схема есть, модуль — позиция 5», РМ21–РМ23), handoff §5.555, README §2.
- [x] `pnpm ci:check` → PR.
