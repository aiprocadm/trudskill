-- 0104_learning_groups_extend.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1 «Слой хранения», срез 0 (МГ-A1.1, МГ-A4.1, §17 «groups»).
-- План: docs/superpowers/plans/2026-09-23-cdoprof-migration-phase-1-slice-0-migrations.md.
--
-- ЗАЧЕМ. Учебные группы сегодня живут в JSON-снимке центра (`learning.mvp_runtime_documents`),
-- а `learning.groups` (0013) спроектирована, но не пишется. Фаза 1 переводит горячие коллекции
-- в таблицы; для этого группе нужны поля CDOPROF (§17): даты экзамена и доступов, форма обучения,
-- ответственный, комментарии — и статусы, которые ставит код (`closed` из close-group-chain)
-- и переносит импорт (`recruiting`, `in_progress`, `exam`, `documents`, `cancelled`).
--
-- ЧТО ДЕЛАЕМ (только добавление, все колонки необязательные или с умолчанием):
--   • колонки §17;
--   • UNIQUE (tenant_id, id) — опора для составных внешних ключей 0105 (анти-IDOR на уровне БД,
--     как `study_groups_tenant_id_id_uniq` в 0003);
--   • CHECK статусов = объединение 0014 + код + §17; старый `learning_groups_status_chk` (0014,
--     NOT VALID) снимается в той же миграции — иначе два CHECK пропускали бы только пересечение;
--   • индексы списков и календаря: (tenant, status, starts_at), (tenant, exam_date), (tenant, ends_at),
--     (tenant, responsible_user_id). Индекс по контрагенту уже есть (0039).
-- `learning.study_groups` (0002) остаётся как deprecated-близнец: не пишется, не сносится.

ALTER TABLE learning.groups
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS exam_access_from timestamptz,
  ADD COLUMN IF NOT EXISTS exam_access_to timestamptz,
  ADD COLUMN IF NOT EXISTS materials_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS practice_from date,
  ADD COLUMN IF NOT EXISTS practice_to date,
  ADD COLUMN IF NOT EXISTS study_form text,
  ADD COLUMN IF NOT EXISTS is_dot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS education_form_at_ppo text,
  ADD COLUMN IF NOT EXISTS access_mode text,
  ADD COLUMN IF NOT EXISTS enrollment_mode text,
  ADD COLUMN IF NOT EXISTS remote_signature boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_identity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsible_user_id text,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS learner_message text,
  ADD COLUMN IF NOT EXISTS notify_on_pass jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE learning.groups
  DROP CONSTRAINT IF EXISTS groups_tenant_id_id_uniq,
  ADD CONSTRAINT groups_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE learning.groups
  DROP CONSTRAINT IF EXISTS learning_groups_status_chk,
  ADD CONSTRAINT learning_groups_status_chk CHECK (status IN (
    'draft', 'scheduled', 'recruiting', 'active', 'in_progress', 'exam', 'documents',
    'completed', 'closed', 'archived', 'cancelled'
  )) NOT VALID;

CREATE INDEX IF NOT EXISTS groups_tenant_status_starts_idx ON learning.groups (tenant_id, status, starts_at);
CREATE INDEX IF NOT EXISTS groups_tenant_exam_date_idx ON learning.groups (tenant_id, exam_date)
  WHERE exam_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_tenant_ends_idx ON learning.groups (tenant_id, ends_at);
CREATE INDEX IF NOT EXISTS groups_tenant_responsible_idx ON learning.groups (tenant_id, responsible_user_id)
  WHERE responsible_user_id IS NOT NULL;
