-- 0052_learning_scorm.sql
-- Phase 9 Plan A — SCORM 1.2 import + player.
--   * learning.materials: + 'scorm' в materials_type_chk, + scorm_package_id.
--   * learning.scorm_packages — загруженный/распакованный пакет (zip в storage.files).
--   * learning.scorm_attempts — cmi-прогресс ученика per (enrollment, material).
-- Прав не добавляем: пакеты = materials.read/write, launch = materials.read,
-- commit = progress.recalculate (все уже выданы ролям).
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule). Mirror of 0051.

BEGIN;

ALTER TABLE learning.materials
  ADD COLUMN IF NOT EXISTS scorm_package_id text;

ALTER TABLE learning.materials
  DROP CONSTRAINT IF EXISTS materials_type_chk;

-- Safe: existing rows only contain ('file','external_url','text','video'); we extend the set with 'scorm'.
ALTER TABLE learning.materials
  ADD CONSTRAINT materials_type_chk
  CHECK (material_type IN ('file', 'external_url', 'text', 'video', 'scorm'));

COMMENT ON COLUMN learning.materials.scorm_package_id IS
  'Phase 9 Plan A: FK на learning.scorm_packages для material_type=scorm; MVP JSON store mirrors this field.';

CREATE TABLE IF NOT EXISTS learning.scorm_packages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  title text NOT NULL,
  package_status text NOT NULL DEFAULT 'uploaded'
    CONSTRAINT scorm_packages_status_chk
    CHECK (package_status IN ('uploaded', 'processing', 'ready', 'failed')),
  zip_file_id text NOT NULL,
  storage_prefix text NOT NULL,
  launch_href text,
  manifest_title text,
  entry_count integer,
  total_bytes bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorm_packages_tenant_status
  ON learning.scorm_packages (tenant_id, package_status);

COMMENT ON TABLE learning.scorm_packages IS
  'Phase 9 Plan A: SCORM 1.2 пакет (zip в storage.files, распакованный контент в S3 под storage_prefix). MVP JSON store mirrors this collection. Soft-delete пакета выполняется в MVP JSON store через BaseEntity.status=''deleted'' (как у остальных MVP-коллекций); package_status хранит только жизненный цикл обработки (uploaded/processing/ready/failed) и значения ''deleted'' не получает.';

CREATE TABLE IF NOT EXISTS learning.scorm_attempts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  enrollment_id text NOT NULL,
  material_id text NOT NULL,
  learner_id text NOT NULL,
  lesson_status text NOT NULL DEFAULT 'not attempted'
    CONSTRAINT scorm_attempts_lesson_status_chk
    CHECK (lesson_status IN ('not attempted', 'incomplete', 'completed', 'passed', 'failed', 'browsed')),
  lesson_location text,
  suspend_data text,
  score_raw numeric,
  score_max numeric,
  score_min numeric,
  total_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  last_commit_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scorm_attempts_tenant_enrollment_material
  ON learning.scorm_attempts (tenant_id, enrollment_id, material_id);

COMMENT ON TABLE learning.scorm_attempts IS
  'Phase 9 Plan A: cmi-прогресс SCORM 1.2 per (enrollment, material); единственная запись, last-write-wins. MVP JSON store mirrors this collection.';

COMMIT;
