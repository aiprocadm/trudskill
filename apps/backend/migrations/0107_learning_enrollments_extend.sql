-- 0107_learning_enrollments_extend.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0 (§17 «enrollments»). Решение РМ31 — см. 0105.
--
-- ЗАЧЕМ. Зачисление CDOPROF несёт результат («сдал / не сдал / не явился») и реквизиты
-- выданного документа (серия, номер удостоверения, номер и дата протокола) — у нас это
-- поля `Enrollment` после импорта (МГ-K5.1) и колонки нормализованной таблицы.
--
-- ЧТО ДЕЛАЕМ:
--   • result_code с CHECK (passed / failed / absent) — «не явился» не является статусом зачисления
--     (статус остаётся `pending/active/suspended/completed/cancelled`, CHECK 0002), а итогом;
--   • реквизиты документа; индексы (tenant, group), (tenant, learner), (tenant, status),
--     (tenant, planned_end_at) — списки, карточки группы и слушателя, сроки;
--   • история статусов получает индекс (tenant, enrollment, changed_at) — карточка зачисления;
--   • снимается `enrollments_completed_payload_chk` (0003: `completed ⇒ completion_state IS NOT NULL`):
--     у `Enrollment` в коде нет поля completion_state, а колонка 0002 нигде не заполняется —
--     ограничение сделало бы невозможной запись завершённого зачисления (РМ31; вернуть одной
--     строкой: `ADD CONSTRAINT enrollments_completed_payload_chk CHECK (status <> 'completed'
--     OR completion_state IS NOT NULL)`). `completed ⇒ completed_at` (0002) остаётся —
--     `completedAt` у сущности есть.

ALTER TABLE learning.enrollments
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS certificate_number text,
  ADD COLUMN IF NOT EXISTS certificate_series text,
  ADD COLUMN IF NOT EXISTS protocol_number text,
  ADD COLUMN IF NOT EXISTS protocol_date date;

ALTER TABLE learning.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_result_code_chk,
  ADD CONSTRAINT enrollments_result_code_chk CHECK (result_code IS NULL OR result_code IN ('passed', 'failed', 'absent'));

ALTER TABLE learning.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_completed_payload_chk;

CREATE INDEX IF NOT EXISTS enrollments_tenant_group_idx ON learning.enrollments (tenant_id, group_id);
CREATE INDEX IF NOT EXISTS enrollments_tenant_learner_idx ON learning.enrollments (tenant_id, learner_id);
CREATE INDEX IF NOT EXISTS enrollments_tenant_status_idx ON learning.enrollments (tenant_id, status);
CREATE INDEX IF NOT EXISTS enrollments_tenant_planned_end_idx ON learning.enrollments (tenant_id, planned_end_at)
  WHERE planned_end_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS enrollment_status_history_tenant_enrollment_idx
  ON learning.enrollment_status_history (tenant_id, enrollment_id, changed_at);
