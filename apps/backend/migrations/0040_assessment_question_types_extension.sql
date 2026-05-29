-- Phase 3 Plan A: расширение допустимых типов вопросов + поля для number_input grading.
-- Дата: 2026-05-30. Назначение: дать админу создавать вопросы 5 runtime-типов
-- (single_choice, multiple_choice, number_input, text, essay) — расширение существующего
-- CHECK с сохранением legacy типа 'boolean' (backward-compat для данных,
-- созданных до Phase 3).  Поля numeric_expected/numeric_tolerance хранят эталон для
-- автогрейдинга в Plan B (Phase 3 learner test player).
--
-- Колонка таблицы называется `question_type` (см. 0002_mvp_domain_model.sql:389),
-- НЕ `type`.
--
-- Plan уточнил тип хранилища: основной runtime — jsonb snapshot в
-- learning.mvp_runtime_documents (см. PostgresMvpPersistenceBackend); эта миграция
-- работает по нормализованной модели assessment.questions, которая используется
-- shadow/normalized read model'ями.

BEGIN;

-- 1. Поднять CHECK на questions.question_type.
--    Сохраняем legacy 'boolean' (используется в данных, созданных до 0040)
--    и добавляем 'number_input' + 'essay' для Plan B+C runtime.
ALTER TABLE assessment.questions
  DROP CONSTRAINT IF EXISTS questions_type_chk;
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_type_chk
    CHECK (question_type IN (
      'single_choice',
      'multiple_choice',
      'number_input',
      'text',
      'essay',
      'boolean'
    ));

-- 2. Добавить эталон для number_input. Nullable: существующие записи валидны.
ALTER TABLE assessment.questions
  ADD COLUMN IF NOT EXISTS numeric_expected numeric NULL,
  ADD COLUMN IF NOT EXISTS numeric_tolerance numeric NULL;

-- 3. Domain rule: number_input должен иметь numeric_expected.
ALTER TABLE assessment.questions
  DROP CONSTRAINT IF EXISTS questions_numeric_expected_required_for_number_input_chk;
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_numeric_expected_required_for_number_input_chk
    CHECK (question_type <> 'number_input' OR numeric_expected IS NOT NULL);

-- 4. tolerance >= 0 (по дизайну absolute tolerance в V1).
ALTER TABLE assessment.questions
  DROP CONSTRAINT IF EXISTS questions_numeric_tolerance_nonneg_chk;
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_numeric_tolerance_nonneg_chk
    CHECK (numeric_tolerance IS NULL OR numeric_tolerance >= 0);

COMMIT;
