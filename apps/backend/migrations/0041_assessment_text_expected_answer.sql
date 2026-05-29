-- Phase 3 Plan B: эталон для text-автогрейдинга + флаг auto_graded на ответах попытки.
-- Дата: 2026-05-30. Назначение: завершить автогрейдинг learner test player.
--   1) assessment.questions.expected_answer — эталон для типа 'text' (autograder
--      сравнивает normalizeText(given) === normalizeText(expected); см.
--      assessment-autograde.service.ts). numeric_expected/numeric_tolerance уже
--      добавлены в 0040 — здесь только текстовый эталон.
--   2) assessment.attempt_answers.auto_graded — был ли ответ оценён машиной (true)
--      или требует ручной проверки / мисконфигурирован (false). Reviewer flow (Plan C)
--      опирается на этот флаг, чтобы собрать очередь на ручную проверку.
--
-- Обе колонки nullable и аддитивны: существующие записи остаются валидными,
-- миграция идемпотентна (IF NOT EXISTS) при повторном прогоне.

BEGIN;

-- 1. Эталон для text-вопросов. Nullable: choice/number/essay его не используют.
ALTER TABLE assessment.questions
  ADD COLUMN IF NOT EXISTS expected_answer text NULL;

-- 2. Флаг автогрейдинга на ответах попытки. Nullable: исторические ответы — NULL.
ALTER TABLE assessment.attempt_answers
  ADD COLUMN IF NOT EXISTS auto_graded boolean NULL;

COMMIT;
