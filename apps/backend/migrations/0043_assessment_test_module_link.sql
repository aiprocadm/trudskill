-- 0043_assessment_test_module_link.sql
-- Wave 1 (module gating): a test may act as the intermediate (gating) test of a
-- course module. Tests with NULL module_id are final/course-level exams.
-- Additive + nullable — safe on existing rows. Idempotent (IF NOT EXISTS).

BEGIN;

ALTER TABLE assessment.tests
  ADD COLUMN IF NOT EXISTS module_id text REFERENCES learning.course_modules(id);

CREATE INDEX IF NOT EXISTS tests_tenant_module_idx
  ON assessment.tests (tenant_id, module_id);

COMMIT;
