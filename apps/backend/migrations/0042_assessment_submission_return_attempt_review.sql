-- 0042_assessment_submission_return_attempt_review.sql
-- Phase 3 Plan C: store reviewer feedback on returned submissions and manual
-- attempt-review metadata. Additive + nullable — safe on existing rows.
-- Mirrors in-memory fields: AssignmentSubmission.returnComment,
-- TestAttempt.reviewComment, TestAttempt.reviewedBy.
-- Idempotent: IF NOT EXISTS guards all three column adds.

BEGIN;

-- Reviewer feedback when a submission is returned for revision (Plan C returnAssignmentSubmission).
ALTER TABLE assessment.assignment_submissions
  ADD COLUMN IF NOT EXISTS return_comment text;

-- Reviewer note written when manually grading essay answers (Plan C completeAttemptReview).
ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS review_comment text;

-- actorId of the reviewer who completed the manual attempt review.
ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS reviewed_by text;

COMMIT;
