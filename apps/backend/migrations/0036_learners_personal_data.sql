-- 0036_learners_personal_data.sql
-- Pillar A Plan C §5.11 — личные данные ученика для PDF-карточки.
-- Также чинит Plan B §5.7 placeholder в group_learners variables (snils/position
-- ранее возвращались как '').
--
-- 3 nullable text-колонки на mvp.learners:
--   snils       — СНИЛС (формат XXX-XXX-XXX YY, валидация на уровне сервиса).
--   middle_name — отчество (для fullName в шаблонах).
--   position    — должность ученика (для протоколов / удостоверений).

-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): the learners table lives in
-- the learning schema (there is no mvp schema — the MVP module is in-memory). Safe
-- to edit history: no DB deployed.
ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS snils text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS position text;
