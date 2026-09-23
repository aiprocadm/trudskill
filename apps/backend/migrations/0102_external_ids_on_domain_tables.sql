-- 0102_external_ids_on_domain_tables.sql
--
-- ТЗ «Переход с CDOPROF», МГ-K2.1: внешний идентификатор и система-источник на контрагенте,
-- сотруднике контрагента, слушателе, группе, зачислении и документе (§17).
--
-- ЗАЧЕМ. Помимо общей таблицы соответствий (`migration.legacy_ids`, 0100) идентификатор
-- источника нужен прямо на строке: по нему импорт делает upsert без второго запроса, а
-- сверка тестовой миграции (МГ-K4.1) сравнивает счётчики «источник ↔ цель» одним
-- соединением. Пара `(source_system, external_id)` уникальна в пределах центра — второй
-- заход импорта не заведёт дубль.
--
-- ЧТО ДЕЛАЕМ (только добавление, все колонки необязательные): в нормализованных таблицах,
-- которые сегодня приложение не читает (домен живёт в снимке) — поэтому поведение не
-- меняется; Фаза 1 переведёт чтение на эти таблицы уже с колонками.
--   • `external_id`, `source_system` — везде;
--   • `legacy_login` у слушателя — логин CDOPROF (пароль не переносится, §13.2);
--   • `legacy_number` у группы — номер группы в CDOPROF как есть (код у нас может получить
--     суффикс при дубле, §13.2);
--   • `is_external`, `external_file_id` у документа — документ, выданный ещё в CDOPROF: у нас
--     только реквизиты и, если удалось выгрузить, файл (МГ-K6.1).

ALTER TABLE crm.counterparties
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text;
CREATE UNIQUE INDEX IF NOT EXISTS counterparties_tenant_external_uniq
  ON crm.counterparties (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE crm.counterparty_employees
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text;
CREATE UNIQUE INDEX IF NOT EXISTS counterparty_employees_tenant_external_uniq
  ON crm.counterparty_employees (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS legacy_login text;
CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_external_uniq
  ON learning.learners (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE learning.groups
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS legacy_number text;
CREATE UNIQUE INDEX IF NOT EXISTS groups_tenant_external_uniq
  ON learning.groups (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE learning.enrollments
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text;
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_tenant_external_uniq
  ON learning.enrollments (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_file_id text;
CREATE UNIQUE INDEX IF NOT EXISTS generated_documents_tenant_external_uniq
  ON documents.generated_documents (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;
