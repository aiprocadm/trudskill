-- 0110_phase1_backfill_prerequisites.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0b (бэкфилл «снимок → таблицы», МГ-A1.2).
-- План: docs/superpowers/plans/2026-09-23-cdoprof-migration-phase-1-slice-0b-backfill.md.
--
-- Разведка перед бэкфиллом нашла четыре места, где строки снимка не легли бы в таблицы
-- (интеграционный тест среза 0 вставлял по ОДНОЙ строке на центр и этого не видел):
--
--   1. `learners_tenant_user_uniq` и `learners_tenant_learner_no_uniq` (0002) объявлены как
--      UNIQUE NULLS NOT DISTINCT — NULL считается равным NULL. Значит в центре мог быть только
--      один слушатель без учётной записи и один без табельного номера. В снимке таких —
--      большинство. Ограничения заменяются частичными уникальными индексами
--      (`WHERE … IS NOT NULL`): смысл «два слушателя не делят одну учётную запись / один номер»
--      сохраняется, «пусто» перестаёт быть значением. Решение РМ31 (снятие ограничения на
--      пустой по построению таблице; вернуть — одной строкой ADD CONSTRAINT … NULLS NOT DISTINCT).
--   2. `exam_results_status_chk` (0002) пускает только draft/final/void, а код пишет ещё
--      `active` и `needs_review` (mvp.service.ts, exam-outcome). CHECK расширяется на значения
--      кода — иначе результат экзамена, ждущий проверки, потерялся бы.
--   3. `learning.group_courses` не имеет ни `status` (у сущности он есть — BaseEntity), ни
--      `payload`: поле терялось бы молча. Добавляются обе колонки.
--   4. `assessment.exam_results` не имеет `payload` — поля сущности без колонки некуда класть.
--
-- Всё — добавление: данных в этих таблицах нет ни на одном контуре (домен живёт в снимке).

-- 1. Слушатели: «пусто» — не значение.
ALTER TABLE learning.learners
  DROP CONSTRAINT IF EXISTS learners_tenant_user_uniq,
  DROP CONSTRAINT IF EXISTS learners_tenant_learner_no_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_user_uniq_idx
  ON learning.learners (tenant_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_learner_no_uniq_idx
  ON learning.learners (tenant_id, learner_no) WHERE learner_no IS NOT NULL;

-- 2. Результаты экзамена: статусы кода.
ALTER TABLE assessment.exam_results
  DROP CONSTRAINT IF EXISTS exam_results_status_chk,
  ADD CONSTRAINT exam_results_status_chk CHECK (status IN ('draft', 'final', 'void', 'active', 'needs_review')) NOT VALID;

-- 3–4. Поля сущности, которым не было места.
ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE assessment.exam_results
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
