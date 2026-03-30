-- Stage 8 assessment extensions
CREATE TABLE IF NOT EXISTS assessment.question_banks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  course_id text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text
);

CREATE INDEX IF NOT EXISTS question_banks_tenant_status_idx ON assessment.question_banks (tenant_id, status);
CREATE INDEX IF NOT EXISTS question_banks_tenant_course_idx ON assessment.question_banks (tenant_id, course_id);

CREATE TABLE IF NOT EXISTS assessment.test_rules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  test_id text NOT NULL,
  attempt_limit integer NOT NULL DEFAULT 1,
  daily_reset_enabled boolean NOT NULL DEFAULT false,
  randomize_questions boolean NOT NULL DEFAULT false,
  question_count integer,
  time_limit_minutes integer,
  passing_score numeric(10,2) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_rules_attempt_limit_chk CHECK (attempt_limit > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS test_rules_tenant_test_uniq ON assessment.test_rules (tenant_id, test_id);
CREATE INDEX IF NOT EXISTS tests_tenant_course_status_idx ON assessment.tests (tenant_id, course_id, status);
CREATE INDEX IF NOT EXISTS test_attempts_tenant_test_learner_idx ON assessment.test_attempts (tenant_id, test_id, learner_id);

CREATE TABLE IF NOT EXISTS assessment.assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  course_id text NOT NULL,
  module_id text,
  title text NOT NULL,
  description text,
  is_review_required boolean NOT NULL DEFAULT true,
  max_score numeric(10,2) NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_tenant_course_status_idx ON assessment.assignments (tenant_id, course_id, status);

CREATE TABLE IF NOT EXISTS assessment.assignment_submissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  assignment_id text NOT NULL,
  enrollment_id text NOT NULL,
  learner_id text NOT NULL,
  text_answer text,
  file_id text,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignment_submissions_tenant_assignment_learner_idx ON assessment.assignment_submissions (tenant_id, assignment_id, learner_id);

CREATE TABLE IF NOT EXISTS assessment.assignment_reviews (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  assignment_id text NOT NULL,
  submission_id text NOT NULL,
  enrollment_id text NOT NULL,
  reviewer_id text NOT NULL,
  score numeric(10,2),
  comment text,
  review_status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
