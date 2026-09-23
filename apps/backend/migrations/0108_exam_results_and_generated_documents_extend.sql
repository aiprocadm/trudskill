-- 0108_exam_results_and_generated_documents_extend.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0 (§17 «generated_documents», МГ-A1.1 «examResults →
-- assessment.exam_results»). Решение РМ31 — см. 0105.
--
-- 1. Результаты экзаменов. Сущность `ExamResult` (mvp.types.ts) хранит число попыток, лучший,
--    максимальный и проходной баллы, а итоговый балл `finalScore` — необязателен. Таблица 0002
--    требовала `final_score NOT NULL` и не имела остальных колонок: добавляем колонки, снимаем
--    NOT NULL (данных нет — таблица пуста по построению; `exam_results_score_chk` пропускает NULL).
--
-- 2. Выданные документы. `GeneratedDocumentEntity` (documents.types.ts) знает статусы
--    generated / final / archived / revoked; таблица получила ДВА CHECK на одну колонку —
--    0002 (`draft, generated, final, cancelled`) и 0014 (`draft, generated, issued, void`, NOT VALID) —
--    и пропускала только `draft` и `generated`. Оба снимаются, ставится один объединённый
--    (значения кода + §17 + оба старых списка). Колонки §17: вид документа, серия, разряд,
--    связь с зачислением и протоколом, трек-номер доставки; из сущности — тип, название,
--    PDF-файл, дата архивации. Индексы: (tenant, learner), (tenant, group), (tenant, kind, date),
--    (tenant, valid_until) — реестр документов, карточки, срок действия (МГ-A2.1/A4.1).
--    `generated_documents_final_state_chk` (0003: is_final ⇒ status = 'final') ОСТАЁТСЯ —
--    проекция обязана писать `is_final = (status = 'final')`.

-- 1. Результаты экзаменов.
ALTER TABLE assessment.exam_results
  ALTER COLUMN final_score DROP NOT NULL;
ALTER TABLE assessment.exam_results
  ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_score numeric(8,2),
  ADD COLUMN IF NOT EXISTS max_score numeric(8,2),
  ADD COLUMN IF NOT EXISTS passing_score numeric(8,2);
CREATE INDEX IF NOT EXISTS exam_results_tenant_learner_idx ON assessment.exam_results (tenant_id, learner_id);

-- 2. Выданные документы.
ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS kind_code text,
  ADD COLUMN IF NOT EXISTS series text,
  ADD COLUMN IF NOT EXISTS rank text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS pdf_file_id text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS protocol_document_id text,
  ADD COLUMN IF NOT EXISTS enrollment_id text,
  ADD COLUMN IF NOT EXISTS tracking_number text;

ALTER TABLE documents.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_status_chk,
  DROP CONSTRAINT IF EXISTS documents_generated_documents_status_chk;
ALTER TABLE documents.generated_documents
  ADD CONSTRAINT generated_documents_status_chk CHECK (status IN (
    'draft', 'generated', 'final', 'issued', 'archived', 'revoked', 'cancelled', 'void'
  )) NOT VALID;

CREATE INDEX IF NOT EXISTS generated_documents_tenant_learner_idx ON documents.generated_documents (tenant_id, learner_id)
  WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS generated_documents_tenant_group_idx ON documents.generated_documents (tenant_id, group_id)
  WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS generated_documents_tenant_kind_date_idx
  ON documents.generated_documents (tenant_id, kind_code, document_date);
CREATE INDEX IF NOT EXISTS generated_documents_tenant_valid_until_idx
  ON documents.generated_documents (tenant_id, valid_until) WHERE valid_until IS NOT NULL;
