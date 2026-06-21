-- 0032_documents_pillar_a_plan_b.sql
-- Pillar A Plan B (§5.4, §5.5, §5.7):
--   1) CHECK на documents.templates.template_type — фиксируем поддерживаемые значения.
--      Spec §5.4 перечисляет 7 типов регулируемого ДПО (certificate/protocol/order/
--      diploma/attestation/reference/report). Дополнительно сохраняем 'contract' —
--      этот тип уже широко используется в существующих тестах и в seed-данных,
--      выпиливать без отдельной миграции опасно (см. Plan B deviations).
--   2) CHECK на documents.template_variables.category_code — 10 категорий:
--      4 базовые (tenant/group/learner/counterparty) + course + commission/program
--      (добавлены в Plan A §5.2 и §5.5) + document/enrollment/group_learners (этот план).
--   3) Колонка group_order_document_id на documents.generated_documents — связывает
--      выпущенное удостоверение с приказом, по которому оно было выпущено (§5.7).
--      Partial index по NOT NULL — для быстрого "покажи все документы по приказу X".
--
-- Идемпотентность: ADD CONSTRAINT IF NOT EXISTS отсутствует в PG <16, поэтому
-- оборачиваем в DO-блок с проверкой pg_constraint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'templates_type_chk'
      AND conrelid = 'documents.templates'::regclass
  ) THEN
    ALTER TABLE documents.templates
      ADD CONSTRAINT templates_type_chk
      -- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): the canonical column is
      -- document_type (created in 0002); the template_type name only existed in the
      -- 0005 "create table if not exists" no-op. Safe to edit history: no DB deployed.
      CHECK (document_type IN (
        'certificate',
        'protocol',
        'order',
        'diploma',
        'attestation',
        'reference',
        'report',
        'contract'
      ));
  END IF;
END$$;

-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): ensure category_code exists
-- before constraining it. The column was defined in 0005's template_variables, but
-- that "create table if not exists" was a no-op (0002 created the table first
-- without it), so the CHECK below targeted a non-existent column on a fresh DB.
-- Safe to edit history: no DB deployed.
ALTER TABLE documents.template_variables
  ADD COLUMN IF NOT EXISTS category_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'template_variables_category_chk'
      AND conrelid = 'documents.template_variables'::regclass
  ) THEN
    ALTER TABLE documents.template_variables
      ADD CONSTRAINT template_variables_category_chk
      CHECK (category_code IN (
        'tenant',
        'group',
        'learner',
        'counterparty',
        'course',
        'commission',
        'document',
        'program',
        'enrollment',
        'group_learners'
      ));
  END IF;
END$$;

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS group_order_document_id text;

CREATE INDEX IF NOT EXISTS idx_generated_documents_group_order
  ON documents.generated_documents (tenant_id, group_order_document_id)
  WHERE group_order_document_id IS NOT NULL;
