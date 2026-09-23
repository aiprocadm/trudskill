-- 0100_migration_legacy_ids_import_runs.sql
--
-- ТЗ «Переход с CDOPROF», МГ-K2.1 (внешние идентификаторы) и МГ-K3.1 (журнал импорта).
--
-- ЗАЧЕМ. Перенос из CDOPROF идёт в несколько заходов (тестовая миграция, финальная,
-- повтор «только ошибки») и по нескольким источникам (API, Excel). Чтобы второй заход не
-- создал дубли первого, каждая перенесённая сущность помнит, откуда она: (источник, тип,
-- id в источнике) → (тип, id у нас). Это и есть идемпотентность импорта по ТЗ §4.
--
-- Схема `migration` уже существует (0018 — бэкфилл снимка в нормализованные таблицы).
-- `backfill_runs` для импорта не годится: там нет центра (tenant_id) и другая семантика
-- (снимок → таблицы, а не внешняя система → центр). Поэтому — свои таблицы.
--
-- ЧТО ДЕЛАЕМ (только добавление; ни одна ручка эти таблицы пока не читает):
--   • `migration.legacy_ids` — соответствие внешних и внутренних идентификаторов;
--   • `migration.import_runs` — запуск импорта (источник, домен, статус, сухой прогон, итоги);
--   • `migration.import_rows` — построчный отчёт запуска: создано / обновлено / пропущено /
--     ошибка с причиной — основа принципа частичного успеха.

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.legacy_ids (
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  source_system text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_system, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS legacy_ids_target_idx
  ON migration.legacy_ids (tenant_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS migration.import_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  source text NOT NULL,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  dry_run boolean NOT NULL DEFAULT false,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by text REFERENCES iam.users(id),
  background_task_id text,
  error_text text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_runs_tenant_status_idx
  ON migration.import_runs (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS migration.import_rows (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES migration.import_runs(id),
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  domain text NOT NULL,
  source_id text,
  target_id text,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'skipped', 'failed')),
  error_code text,
  error_text text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_rows_run_action_idx
  ON migration.import_rows (run_id, action);

CREATE INDEX IF NOT EXISTS import_rows_run_source_idx
  ON migration.import_rows (run_id, source_id);
