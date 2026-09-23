-- 0101_tasks_schema.sql
--
-- ТЗ «Переход с CDOPROF», МГ-G2 (схема задач; §4 «Задача», §17).
--
-- ЗАЧЕМ. «Календарь» CDOPROF — это планировщик задач сотрудников: у задачи есть исполнители,
-- срок, статус, комментарии, файлы и привязка к контрагенту/группе/слушателю. Без задач
-- куратор не сможет уйти из CDOPROF (§0 п. 2). Модуль `tasks` (позиция 5) пишет СРАЗУ в
-- нормализованные таблицы — не в JSON-снимок: спайк позиции 3 показал, что снимок не
-- выдерживает объём CDOPROF (docs/LOAD_TEST_RESULTS.md, 2026-09-23). Эти таблицы станут
-- образцом репозитория для Фазы 1.
--
-- ЧТО ДЕЛАЕМ (только добавление; ни одна ручка схему пока не читает):
--   • `tasks.tasks` — задача; статусы по §4: new → in_progress → done → confirmed (+ cancelled),
--     «просрочена» вычисляется по `due_at`, а не хранится;
--   • `tasks.task_assignees` — исполнители с состоянием каждого;
--   • `tasks.task_comments`, `tasks.task_files` — лента и вложения.
--
-- Ссылки на группу, контрагента, слушателя — колонками с индексами, БЕЗ внешних ключей
-- (решение РМ23): целевые таблицы этих сущностей меняет Фаза 1 (объединение `study_groups`
-- и `groups`, перенос слушателей из снимка); внешний ключ на таблицу, которая через фазу
-- станет другой, пришлось бы снимать миграцией. Ключи добавит Фаза 1 вместе с бэкфиллом
-- (`NOT VALID` + `VALIDATE`). Пользователи (`iam.users`) стабильны — на них ключи есть.

CREATE SCHEMA IF NOT EXISTS tasks;

CREATE TABLE IF NOT EXISTS tasks.tasks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'done', 'confirmed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  label text,
  color text,
  starts_at timestamptz,
  due_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  creator_user_id text NOT NULL REFERENCES iam.users(id),
  counterparty_id text,
  contact_id text,
  group_id text,
  learner_id text,
  lesson_id text,
  reminder jsonb,
  recurrence jsonb,
  done_at timestamptz,
  confirmed_at timestamptz,
  external_id text,
  source_system text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (due_at IS NULL OR starts_at IS NULL OR due_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS tasks_tenant_status_due_idx
  ON tasks.tasks (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_tenant_creator_idx
  ON tasks.tasks (tenant_id, creator_user_id);
CREATE INDEX IF NOT EXISTS tasks_tenant_group_idx
  ON tasks.tasks (tenant_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_tenant_counterparty_idx
  ON tasks.tasks (tenant_id, counterparty_id) WHERE counterparty_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_tenant_external_uniq
  ON tasks.tasks (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tasks.task_assignees (
  task_id text NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  user_id text NOT NULL REFERENCES iam.users(id),
  state text NOT NULL DEFAULT 'assigned'
    CHECK (state IN ('assigned', 'in_progress', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS task_assignees_tenant_user_state_idx
  ON tasks.task_assignees (tenant_id, user_id, state);

CREATE TABLE IF NOT EXISTS tasks.task_comments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  task_id text NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES iam.users(id),
  text text NOT NULL CHECK (char_length(text) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_created_idx
  ON tasks.task_comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS tasks.task_files (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  task_id text NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES iam.users(id),
  file_id text NOT NULL REFERENCES storage.files(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_files_task_created_idx
  ON tasks.task_files (task_id, created_at);
