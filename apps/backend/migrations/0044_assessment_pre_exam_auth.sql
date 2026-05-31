-- 0044_assessment_pre_exam_auth.sql
-- Wave 1 Plan 2 (Приказ Минобрнауки №816): identity authentication before a
-- final/course-level exam.
--   * group_courses.requires_pre_exam_auth — per-group-course toggle.
--   * test_attempts.identity_verified_at / identity_verification_token_id — fact
--     recorded on the attempt (mirrors TestAttempt.identityVerifiedAt / *TokenId).
--   * assessment.pre_exam_tokens — single-use, hash-only, TTL tokens (mirrors
--     iam.magic_link_tokens) + exam context (enrollment_id, test_id, learner_id).
-- Additive + nullable/defaulted — safe on existing rows. Idempotent.
-- NOTE: runtime MVP state persists as a JSONB snapshot; these typed columns are
-- the schema contract (0016) — domain FKs/flags stay typed.

BEGIN;

-- (C) per-group-course toggle: does this course's final exam require identity auth?
ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_pre_exam_auth boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_pre_exam_auth IS
  'Приказ №816: require identity verification before the final exam; MVP JSON store mirrors this field.';

-- fact recorded on the attempt when identity was verified before start.
ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;

ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS identity_verification_token_id text;

COMMENT ON COLUMN assessment.test_attempts.identity_verified_at IS
  'When the learner confirmed identity (Приказ №816) before this attempt; MVP JSON store mirrors this field.';

-- single-use identity tokens; hash-only storage; raw token only in the e-mail link.
CREATE TABLE IF NOT EXISTS assessment.pre_exam_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  enrollment_id text NOT NULL,
  test_id text NOT NULL,
  learner_id text NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  verified_by_actor_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS pre_exam_tokens_token_hash_uidx
  ON assessment.pre_exam_tokens (tenant_id, token_hash);

CREATE INDEX IF NOT EXISTS pre_exam_tokens_context_idx
  ON assessment.pre_exam_tokens (tenant_id, enrollment_id, test_id, consumed_at);

COMMENT ON TABLE assessment.pre_exam_tokens IS
  'Pre-exam identity tokens (Приказ №816). Hash-only storage; a consumed token is the verification record. MVP JSON store mirrors this collection.';

COMMIT;
