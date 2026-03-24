CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS assessment;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS crm.counterparties (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  legal_name text,
  tax_number text,
  status text NOT NULL DEFAULT 'active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT counterparties_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT counterparties_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS counterparties_tenant_name_idx ON crm.counterparties (tenant_id, name);
CREATE INDEX IF NOT EXISTS counterparties_tenant_status_idx ON crm.counterparties (tenant_id, status);

CREATE TABLE IF NOT EXISTS crm.counterparty_contacts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  counterparty_id text NOT NULL REFERENCES crm.counterparties(id),
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  position text,
  is_primary boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT counterparty_contacts_email_chk CHECK (email IS NULL OR position('@' IN email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS counterparty_contacts_primary_uniq
  ON crm.counterparty_contacts (tenant_id, counterparty_id)
  WHERE is_primary = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS counterparty_contacts_search_idx ON crm.counterparty_contacts (tenant_id, counterparty_id, last_name, first_name);

CREATE TABLE IF NOT EXISTS crm.counterparty_employees (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  counterparty_id text NOT NULL REFERENCES crm.counterparties(id),
  contact_id text REFERENCES crm.counterparty_contacts(id),
  employee_no text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  middle_name text,
  email text,
  phone text,
  position text,
  status text NOT NULL DEFAULT 'active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT counterparty_employees_status_chk CHECK (status IN ('active', 'inactive', 'dismissed')),
  CONSTRAINT counterparty_employees_tenant_counterparty_empno_uniq UNIQUE NULLS NOT DISTINCT (tenant_id, counterparty_id, employee_no)
);

CREATE INDEX IF NOT EXISTS counterparty_employees_search_idx ON crm.counterparty_employees (tenant_id, counterparty_id, last_name, first_name);

CREATE TABLE IF NOT EXISTS learning.learners (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  user_id text REFERENCES iam.users(id),
  counterparty_id text REFERENCES crm.counterparties(id),
  counterparty_employee_id text REFERENCES crm.counterparty_employees(id),
  learner_no text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  middle_name text,
  birth_date date,
  email text,
  phone text,
  identity_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT learners_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT learners_tenant_user_uniq UNIQUE NULLS NOT DISTINCT (tenant_id, user_id),
  CONSTRAINT learners_tenant_learner_no_uniq UNIQUE NULLS NOT DISTINCT (tenant_id, learner_no)
);

CREATE INDEX IF NOT EXISTS learners_tenant_name_idx ON learning.learners (tenant_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS learners_tenant_counterparty_idx ON learning.learners (tenant_id, counterparty_id);

CREATE TABLE IF NOT EXISTS learning.directions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  parent_direction_id text REFERENCES learning.directions(id),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT directions_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT directions_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS directions_tenant_parent_idx ON learning.directions (tenant_id, parent_direction_id, sort_order);

CREATE TABLE IF NOT EXISTS learning.courses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  direction_id text REFERENCES learning.directions(id),
  code text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  is_archived boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT courses_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT courses_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS courses_tenant_direction_idx ON learning.courses (tenant_id, direction_id);
CREATE INDEX IF NOT EXISTS courses_tenant_status_idx ON learning.courses (tenant_id, status);

CREATE TABLE IF NOT EXISTS learning.course_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_id text NOT NULL REFERENCES learning.courses(id),
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_versions_no_chk CHECK (version_no > 0),
  CONSTRAINT course_versions_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT course_versions_tenant_course_version_uniq UNIQUE (tenant_id, course_id, version_no)
);

CREATE TABLE IF NOT EXISTS learning.course_settings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_id text NOT NULL REFERENCES learning.courses(id),
  active_version_id text REFERENCES learning.course_versions(id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_settings_tenant_course_uniq UNIQUE (tenant_id, course_id)
);

CREATE TABLE IF NOT EXISTS learning.course_modules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_version_id text NOT NULL REFERENCES learning.course_versions(id),
  code text,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  min_view_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_modules_min_view_chk CHECK (min_view_seconds >= 0),
  CONSTRAINT course_modules_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT course_modules_tenant_version_code_uniq UNIQUE NULLS NOT DISTINCT (tenant_id, course_version_id, code)
);

CREATE INDEX IF NOT EXISTS course_modules_tenant_version_order_idx ON learning.course_modules (tenant_id, course_version_id, sort_order);

CREATE TABLE IF NOT EXISTS learning.materials (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  module_id text NOT NULL REFERENCES learning.course_modules(id),
  code text,
  title text NOT NULL,
  material_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  min_view_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materials_type_chk CHECK (material_type IN ('file', 'external_url', 'text', 'video')),
  CONSTRAINT materials_min_view_chk CHECK (min_view_seconds >= 0),
  CONSTRAINT materials_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT materials_tenant_module_code_uniq UNIQUE NULLS NOT DISTINCT (tenant_id, module_id, code)
);

CREATE INDEX IF NOT EXISTS materials_tenant_module_order_idx ON learning.materials (tenant_id, module_id, sort_order);

CREATE TABLE IF NOT EXISTS learning.material_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  material_id text NOT NULL REFERENCES learning.materials(id),
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  storage_file_id text REFERENCES storage.files(id),
  external_url text,
  content_json jsonb,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_versions_no_chk CHECK (version_no > 0),
  CONSTRAINT material_versions_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT material_versions_location_chk CHECK ((storage_file_id IS NOT NULL) <> (external_url IS NOT NULL)),
  CONSTRAINT material_versions_tenant_material_version_uniq UNIQUE (tenant_id, material_id, version_no)
);

CREATE TABLE IF NOT EXISTS learning.study_groups (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  access_from timestamptz,
  access_to timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT study_groups_status_chk CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  CONSTRAINT study_groups_period_chk CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT study_groups_access_chk CHECK (access_to IS NULL OR access_from IS NULL OR access_to >= access_from),
  CONSTRAINT study_groups_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS learning.group_courses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  group_id text NOT NULL REFERENCES learning.study_groups(id),
  course_id text NOT NULL REFERENCES learning.courses(id),
  course_version_id text REFERENCES learning.course_versions(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_courses_tenant_group_course_uniq UNIQUE (tenant_id, group_id, course_id)
);

CREATE INDEX IF NOT EXISTS group_courses_tenant_group_sort_idx ON learning.group_courses (tenant_id, group_id, sort_order);

CREATE TABLE IF NOT EXISTS learning.enrollments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  group_id text NOT NULL REFERENCES learning.study_groups(id),
  learner_id text NOT NULL REFERENCES learning.learners(id),
  status text NOT NULL DEFAULT 'pending',
  completion_state text,
  final_score numeric(6,2),
  completed_at timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  access_from timestamptz,
  access_to timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollments_status_chk CHECK (status IN ('pending', 'active', 'suspended', 'completed', 'cancelled')),
  CONSTRAINT enrollments_final_score_chk CHECK (final_score IS NULL OR final_score >= 0),
  CONSTRAINT enrollments_completed_state_chk CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CONSTRAINT enrollments_access_chk CHECK (access_to IS NULL OR access_from IS NULL OR access_to >= access_from),
  CONSTRAINT enrollments_group_learner_uniq UNIQUE (group_id, learner_id)
);

CREATE INDEX IF NOT EXISTS enrollments_tenant_group_status_idx ON learning.enrollments (tenant_id, group_id, status);
CREATE INDEX IF NOT EXISTS enrollments_tenant_learner_status_idx ON learning.enrollments (tenant_id, learner_id, status);

CREATE TABLE IF NOT EXISTS learning.enrollment_status_history (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  enrollment_id text NOT NULL REFERENCES learning.enrollments(id),
  status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_status_history_status_chk CHECK (status IN ('pending', 'active', 'suspended', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS enrollment_status_history_tenant_enrollment_idx ON learning.enrollment_status_history (tenant_id, enrollment_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS learning.course_progress (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  enrollment_id text NOT NULL REFERENCES learning.enrollments(id),
  course_id text NOT NULL REFERENCES learning.courses(id),
  status text NOT NULL DEFAULT 'not_started',
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  studied_seconds integer NOT NULL DEFAULT 0,
  required_seconds integer NOT NULL DEFAULT 0,
  is_time_requirement_met boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_progress_status_chk CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')),
  CONSTRAINT course_progress_percent_chk CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT course_progress_seconds_chk CHECK (studied_seconds >= 0 AND required_seconds >= 0),
  CONSTRAINT course_progress_completed_chk CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CONSTRAINT course_progress_tenant_enrollment_course_uniq UNIQUE (tenant_id, enrollment_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_progress_tenant_enrollment_idx ON learning.course_progress (tenant_id, enrollment_id, status);

CREATE TABLE IF NOT EXISTS learning.module_progress (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_progress_id text NOT NULL REFERENCES learning.course_progress(id),
  module_id text NOT NULL REFERENCES learning.course_modules(id),
  status text NOT NULL DEFAULT 'not_started',
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  studied_seconds integer NOT NULL DEFAULT 0,
  required_seconds integer NOT NULL DEFAULT 0,
  is_time_requirement_met boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_progress_status_chk CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')),
  CONSTRAINT module_progress_percent_chk CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT module_progress_seconds_chk CHECK (studied_seconds >= 0 AND required_seconds >= 0),
  CONSTRAINT module_progress_tenant_course_module_uniq UNIQUE (tenant_id, course_progress_id, module_id)
);

CREATE TABLE IF NOT EXISTS learning.material_progress (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  module_progress_id text NOT NULL REFERENCES learning.module_progress(id),
  material_id text NOT NULL REFERENCES learning.materials(id),
  material_version_id text REFERENCES learning.material_versions(id),
  status text NOT NULL DEFAULT 'not_started',
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  studied_seconds integer NOT NULL DEFAULT 0,
  required_seconds integer NOT NULL DEFAULT 0,
  is_time_requirement_met boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_progress_status_chk CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed')),
  CONSTRAINT material_progress_percent_chk CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT material_progress_seconds_chk CHECK (studied_seconds >= 0 AND required_seconds >= 0),
  CONSTRAINT material_progress_tenant_module_material_uniq UNIQUE (tenant_id, module_progress_id, material_id)
);

CREATE TABLE IF NOT EXISTS assessment.tests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_id text REFERENCES learning.courses(id),
  course_version_id text REFERENCES learning.course_versions(id),
  code text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  passing_score numeric(6,2) NOT NULL DEFAULT 0,
  max_attempts integer,
  time_limit_seconds integer,
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_answers boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tests_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT tests_passing_score_chk CHECK (passing_score >= 0),
  CONSTRAINT tests_max_attempts_chk CHECK (max_attempts IS NULL OR max_attempts > 0),
  CONSTRAINT tests_time_limit_chk CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  CONSTRAINT tests_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS assessment.questions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  question_type text NOT NULL,
  text text NOT NULL,
  explanation text,
  points numeric(8,2) NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_type_chk CHECK (question_type IN ('single_choice', 'multiple_choice', 'text', 'boolean')),
  CONSTRAINT questions_points_chk CHECK (points >= 0)
);

CREATE TABLE IF NOT EXISTS assessment.test_questions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  test_id text NOT NULL REFERENCES assessment.tests(id),
  question_id text NOT NULL REFERENCES assessment.questions(id),
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_questions_tenant_test_question_uniq UNIQUE (tenant_id, test_id, question_id)
);

CREATE TABLE IF NOT EXISTS assessment.answer_options (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  question_id text NOT NULL REFERENCES assessment.questions(id),
  option_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  score numeric(8,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT answer_options_score_chk CHECK (score >= 0)
);

CREATE TABLE IF NOT EXISTS assessment.test_attempts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  test_id text NOT NULL REFERENCES assessment.tests(id),
  enrollment_id text NOT NULL REFERENCES learning.enrollments(id),
  learner_id text NOT NULL REFERENCES learning.learners(id),
  attempt_no integer NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  score numeric(8,2),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_attempts_no_chk CHECK (attempt_no > 0),
  CONSTRAINT test_attempts_score_chk CHECK (score IS NULL OR score >= 0),
  CONSTRAINT test_attempts_status_chk CHECK (status IN ('in_progress', 'submitted', 'evaluated', 'cancelled')),
  CONSTRAINT test_attempts_tenant_test_enrollment_attempt_uniq UNIQUE (tenant_id, test_id, enrollment_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS test_attempts_tenant_enrollment_status_idx ON assessment.test_attempts (tenant_id, enrollment_id, status);

CREATE TABLE IF NOT EXISTS assessment.attempt_answers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  attempt_id text NOT NULL REFERENCES assessment.test_attempts(id),
  question_id text NOT NULL REFERENCES assessment.questions(id),
  answer_option_id text REFERENCES assessment.answer_options(id),
  text_answer text,
  is_correct boolean,
  score numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_answers_score_chk CHECK (score IS NULL OR score >= 0),
  CONSTRAINT attempt_answers_value_chk CHECK (answer_option_id IS NOT NULL OR text_answer IS NOT NULL),
  CONSTRAINT attempt_answers_tenant_attempt_question_uniq UNIQUE (tenant_id, attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS assessment.exam_results (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  enrollment_id text NOT NULL REFERENCES learning.enrollments(id),
  learner_id text NOT NULL REFERENCES learning.learners(id),
  test_id text NOT NULL REFERENCES assessment.tests(id),
  best_attempt_id text REFERENCES assessment.test_attempts(id),
  final_score numeric(8,2) NOT NULL,
  is_passed boolean NOT NULL,
  status text NOT NULL DEFAULT 'final',
  finalized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_results_score_chk CHECK (final_score >= 0),
  CONSTRAINT exam_results_status_chk CHECK (status IN ('draft', 'final', 'void')),
  CONSTRAINT exam_results_tenant_enrollment_test_uniq UNIQUE (tenant_id, enrollment_id, test_id)
);

CREATE TABLE IF NOT EXISTS documents.templates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  document_type text NOT NULL,
  active_version_id text,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT templates_status_chk CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT templates_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS documents.template_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_id text NOT NULL REFERENCES documents.templates(id),
  version_no integer NOT NULL,
  storage_file_id text REFERENCES storage.files(id),
  status text NOT NULL DEFAULT 'draft',
  variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_versions_no_chk CHECK (version_no > 0),
  CONSTRAINT template_versions_status_chk CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT template_versions_tenant_template_version_uniq UNIQUE (tenant_id, template_id, version_no)
);

ALTER TABLE documents.templates
  DROP CONSTRAINT IF EXISTS templates_active_version_fk,
  ADD CONSTRAINT templates_active_version_fk FOREIGN KEY (active_version_id) REFERENCES documents.template_versions(id);

CREATE TABLE IF NOT EXISTS documents.template_variables (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_id text NOT NULL REFERENCES documents.templates(id),
  variable_key text NOT NULL,
  display_name text NOT NULL,
  data_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  default_value text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_variables_data_type_chk CHECK (data_type IN ('string', 'number', 'date', 'boolean', 'json')),
  CONSTRAINT template_variables_tenant_template_key_uniq UNIQUE (tenant_id, template_id, variable_key)
);

CREATE TABLE IF NOT EXISTS documents.template_bindings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_id text NOT NULL REFERENCES documents.templates(id),
  direction_id text REFERENCES learning.directions(id),
  course_id text REFERENCES learning.courses(id),
  group_id text REFERENCES learning.study_groups(id),
  priority integer NOT NULL DEFAULT 100,
  is_inherited boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_bindings_scope_chk CHECK (direction_id IS NOT NULL OR course_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS template_bindings_lookup_idx ON documents.template_bindings (tenant_id, is_active, priority, direction_id, course_id, group_id);

CREATE TABLE IF NOT EXISTS documents.generated_documents (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_id text REFERENCES documents.templates(id),
  template_version_id text REFERENCES documents.template_versions(id),
  source_entity_type text NOT NULL,
  source_entity_id text NOT NULL,
  learner_id text REFERENCES learning.learners(id),
  group_id text REFERENCES learning.study_groups(id),
  counterparty_id text REFERENCES crm.counterparties(id),
  storage_file_id text REFERENCES storage.files(id),
  status text NOT NULL DEFAULT 'draft',
  is_final boolean NOT NULL DEFAULT false,
  document_number text,
  document_date date,
  generated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_documents_status_chk CHECK (status IN ('draft', 'generated', 'final', 'cancelled')),
  CONSTRAINT generated_documents_final_date_chk CHECK ((is_final = false) OR (document_date IS NOT NULL)),
  CONSTRAINT generated_documents_finalized_at_chk CHECK ((is_final = false) OR (finalized_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS generated_documents_lookup_idx ON documents.generated_documents (tenant_id, source_entity_type, source_entity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS generated_documents_tenant_number_uniq
  ON documents.generated_documents (tenant_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS documents.numbering_rules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  document_type text NOT NULL,
  prefix text,
  pattern text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  reset_policy text NOT NULL DEFAULT 'never',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numbering_rules_next_number_chk CHECK (next_number > 0),
  CONSTRAINT numbering_rules_reset_policy_chk CHECK (reset_policy IN ('never', 'yearly', 'monthly')),
  CONSTRAINT numbering_rules_tenant_document_type_uniq UNIQUE (tenant_id, document_type)
);

CREATE TABLE IF NOT EXISTS documents.number_reservations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  numbering_rule_id text NOT NULL REFERENCES documents.numbering_rules(id),
  document_type text NOT NULL,
  reserved_number text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  generated_document_id text REFERENCES documents.generated_documents(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT number_reservations_status_chk CHECK (status IN ('reserved', 'consumed', 'released', 'expired')),
  CONSTRAINT number_reservations_consumed_chk CHECK (status <> 'consumed' OR generated_document_id IS NOT NULL),
  CONSTRAINT number_reservations_expiry_chk CHECK (expires_at IS NULL OR expires_at >= reserved_at),
  CONSTRAINT number_reservations_tenant_rule_number_uniq UNIQUE (tenant_id, numbering_rule_id, reserved_number)
);

CREATE INDEX IF NOT EXISTS number_reservations_tenant_status_idx ON documents.number_reservations (tenant_id, status, reserved_at DESC);

ALTER TABLE storage.files
  ADD COLUMN IF NOT EXISTS bucket_name text,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS antivirus_status text,
  ADD COLUMN IF NOT EXISTS antivirus_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id text REFERENCES iam.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE storage.files SET bucket_name = COALESCE(bucket_name, 'default') WHERE bucket_name IS NULL;
UPDATE storage.files SET antivirus_status = COALESCE(antivirus_status, 'pending') WHERE antivirus_status IS NULL;

ALTER TABLE storage.files
  ALTER COLUMN bucket_name SET NOT NULL,
  ALTER COLUMN antivirus_status SET NOT NULL;

ALTER TABLE storage.files
  DROP CONSTRAINT IF EXISTS files_antivirus_status_chk,
  ADD CONSTRAINT files_antivirus_status_chk CHECK (antivirus_status IN ('pending', 'clean', 'infected', 'error'));

CREATE UNIQUE INDEX IF NOT EXISTS files_tenant_bucket_key_uniq ON storage.files (tenant_id, bucket_name, storage_key);
CREATE INDEX IF NOT EXISTS files_tenant_checksum_idx ON storage.files (tenant_id, checksum);

CREATE TABLE IF NOT EXISTS storage.file_links (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  file_id text NOT NULL REFERENCES storage.files(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  link_role text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT file_links_tenant_file_entity_role_uniq UNIQUE (tenant_id, file_id, entity_type, entity_id, link_role)
);

CREATE INDEX IF NOT EXISTS file_links_tenant_entity_idx ON storage.file_links (tenant_id, entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS file_links_primary_uniq
  ON storage.file_links (tenant_id, entity_type, entity_id, link_role)
  WHERE is_primary = true AND deleted_at IS NULL;
