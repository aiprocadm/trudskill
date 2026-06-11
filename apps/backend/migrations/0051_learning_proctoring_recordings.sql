-- 0051_learning_proctoring_recordings.sql
-- Phase 4 Plan B — proctoring: webcam video recording of final exams.
--   * learning.group_courses.requires_proctoring — per-group-course toggle.
--   * learning.enrollments.proctoring_override — per-student override ('require'|'exempt'|NULL=inherit).
--   * learning.proctoring_recordings — per-(learner,group,course) recording session; chunk files
--     live in storage.files (jsonb chunks = [{sequence,fileId,uploadedIntentAt}]); metadata
--     (consent, attempt link) persists after the video retention cron purges the files.
--   * iam permissions proctoring.submit / proctoring.read + role grants.
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule — domain FKs/flags stay typed). Mirror of 0050.

BEGIN;

ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_proctoring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_proctoring IS
  'Phase 4 Plan B: record the final exam on webcam video; MVP JSON store mirrors this field.';

ALTER TABLE learning.enrollments
  ADD COLUMN IF NOT EXISTS proctoring_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_proctoring_override_chk'
  ) THEN
    ALTER TABLE learning.enrollments
      ADD CONSTRAINT enrollments_proctoring_override_chk
      CHECK (proctoring_override IS NULL OR proctoring_override IN ('require', 'exempt'));
  END IF;
END $$;

COMMENT ON COLUMN learning.enrollments.proctoring_override IS
  'Phase 4 Plan B: per-student proctoring override; NULL inherits group_courses.requires_proctoring.';

CREATE TABLE IF NOT EXISTS learning.proctoring_recordings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  learner_id text NOT NULL,
  group_id text NOT NULL,
  course_id text NOT NULL,
  attempt_id text,
  recording_status text NOT NULL DEFAULT 'recording',
  consent_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctoring_recordings_tenant_learner
  ON learning.proctoring_recordings (tenant_id, learner_id, recording_status);

COMMENT ON TABLE learning.proctoring_recordings IS
  'Phase 4 Plan B: webcam recording session of a final exam (152-ФЗ consent stamped). Chunk files are purged by the video retention cron; the session record persists. MVP JSON store mirrors this collection.';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_proctoring_submit', 'proctoring.submit', 'Start/upload/complete own proctoring recording session'),
  ('p_proctoring_read', 'proctoring.read', 'Read proctoring recordings queue, detail and playback')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON TRUE
WHERE r.tenant_id = 'tenant_demo'
  AND (
    r.code IN ('platform_admin', 'tenant_admin')
    OR (r.code = 'learner' AND p.code = 'proctoring.submit')
    OR (r.code = 'methodist' AND p.code = 'proctoring.read')
  )
  AND p.code IN ('proctoring.submit', 'proctoring.read')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
