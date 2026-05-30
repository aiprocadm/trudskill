-- 0043_assessment_test_module_link.sql
-- Wave 1 (module gating): a test may act as the intermediate (gating) test of a
-- course module. Tests with NULL module_id are final/course-level exams.
-- Additive + nullable — safe on existing rows. Idempotent (IF NOT EXISTS / DO$$).

BEGIN;

ALTER TABLE assessment.tests
  ADD COLUMN IF NOT EXISTS module_id text;

DO $$ BEGIN
  ALTER TABLE assessment.tests
    ADD CONSTRAINT tests_module_tenant_fk
      FOREIGN KEY (tenant_id, module_id) REFERENCES learning.course_modules (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS tests_tenant_module_idx
  ON assessment.tests (tenant_id, module_id);

COMMIT;
