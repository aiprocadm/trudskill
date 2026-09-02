-- apps/backend/migrations/0090_documents_runtime_json_lookup_indexes.sql
--
-- Журнал 331: фильтр по JSON-полю без индекса — это полный перебор таблицы.
--
-- Сущности документов хранятся снимками: строка — это JSON в колонке `data`
-- (docs/mvp-domain-database.md). Существующие индексы снимков начинаются с `tenant_id`,
-- поэтому запросу БЕЗ арендатора не подходит ни один. А таких запросов два, и оба горячие:
--
--   1. Публичная проверка документа по QR: `where collection = 'generatedDocuments'
--      and data->>'qrToken' = $1`. Арендатора там нет по замыслу — код сканируется
--      посторонним человеком. Значит перебирались документы ВСЕХ центров, на
--      неаутентифицированной ручке.
--   2. Готовность (`/health/ready`): `where collection = 'tasks' and data->>'status'
--      in ('queued','running')`. Вызывается на каждом опросе живости, то есть постоянно.
--      Тот же индекс обслуживает сборщик зависших задач (он берёт `status = 'running'`).
--
-- Образец — миграция `0061` (слепой хэш СНИЛС): частичный индекс по выражению с условием
-- по коллекции. Частичный он не для красоты: активных задач и выданных документов в снимке
-- на порядки меньше, чем строк всего, поэтому индекс остаётся маленьким.
--
-- Индексы заводятся на ОБЕ таблицы-снимка: читаемая выбирается переменной
-- `DOCUMENTS_READ_MODEL`, и правка настройки не должна возвращать полный перебор.
--
-- Чего здесь НЕТ и почему: индекса по `data->>'startedAt'` (сборщик зависших задач).
-- Запрос сравнивает его КАК ВРЕМЯ — `(data->>'startedAt')::timestamptz < now() - interval`,
-- а приведение текста к timestamptz не является постоянным (stable, не immutable), и такое
-- выражение Postgres индексировать не даёт. После фильтра по `status = 'running'` остаются
-- единицы строк, поэтому доиндексировать там нечего.

CREATE INDEX IF NOT EXISTS idx_documents_runtime_generated_qr_token
  ON documents.runtime_documents ((data ->> 'qrToken'))
  WHERE collection = 'generatedDocuments';

CREATE INDEX IF NOT EXISTS idx_documents_stage1_generated_qr_token
  ON documents.stage1_runtime_documents ((data ->> 'qrToken'))
  WHERE collection = 'generatedDocuments';

CREATE INDEX IF NOT EXISTS idx_documents_runtime_tasks_status
  ON documents.runtime_documents ((data ->> 'status'))
  WHERE collection = 'tasks';

CREATE INDEX IF NOT EXISTS idx_documents_stage1_tasks_status
  ON documents.stage1_runtime_documents ((data ->> 'status'))
  WHERE collection = 'tasks';
