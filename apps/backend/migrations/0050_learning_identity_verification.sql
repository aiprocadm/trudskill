-- 0050_learning_identity_verification.sql
-- Phase 4 Plan A — identity verification (selfie + passport, manual review).
--   * learning.group_courses.requires_identity_verification — per-group-course toggle.
--   * learning.identity_verifications — per-LEARNER verification record; the images live in
--     storage.files (selfie_file_id / passport_file_id); decision persists after image purge.
--   * iam permissions identity.submit / identity.read / identity.review + role grants.
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule — domain FKs/flags stay typed).

BEGIN;

ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_identity_verification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_identity_verification IS
  'Phase 4 Plan A: require documentary identity verification (selfie+passport) before the final exam; MVP JSON store mirrors this field.';

CREATE TABLE IF NOT EXISTS learning.identity_verifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  learner_id text NOT NULL,
  method text NOT NULL DEFAULT 'selfie_passport',
  verification_status text NOT NULL DEFAULT 'draft',
  selfie_file_id text,
  passport_file_id text,
  consent_at timestamptz,
  submitted_at timestamptz,
  reviewed_by_actor_id text,
  reviewed_at timestamptz,
  rejection_reason text,
  valid_until timestamptz,
  images_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_tenant_learner
  ON learning.identity_verifications (tenant_id, learner_id, verification_status);

COMMENT ON TABLE learning.identity_verifications IS
  'Phase 4 Plan A: documentary identity verification (selfie+passport, manual review). Decision record persists; image files are purged by the retention cron. MVP JSON store mirrors this collection.';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_identity_submit', 'identity.submit', 'Submit own identity verification (selfie + passport)'),
  ('p_identity_read', 'identity.read', 'Read identity verification queue and records'),
  ('p_identity_review', 'identity.review', 'Approve or reject identity verifications')
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
    OR (r.code = 'learner' AND p.code = 'identity.submit')
    OR (r.code = 'methodist' AND p.code IN ('identity.read', 'identity.review'))
  )
  AND p.code IN ('identity.submit', 'identity.read', 'identity.review')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
