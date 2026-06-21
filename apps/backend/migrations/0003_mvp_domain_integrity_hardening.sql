-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): removed a redundant second
-- DROP/ADD of files_tenant_id_id_uniq that failed once FKs depended on it. Safe to
-- edit history: no DB is deployed. See
-- docs/superpowers/specs/2026-06-20-migration-chain-fresh-bootstrap-design.md
ALTER TABLE crm.counterparties
  DROP CONSTRAINT IF EXISTS counterparties_tenant_id_id_uniq,
  ADD CONSTRAINT counterparties_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE iam.users
  DROP CONSTRAINT IF EXISTS users_tenant_id_id_uniq,
  ADD CONSTRAINT users_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE storage.files
  DROP CONSTRAINT IF EXISTS files_tenant_id_id_uniq,
  ADD CONSTRAINT files_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE crm.counterparty_contacts
  DROP CONSTRAINT IF EXISTS counterparty_contacts_tenant_id_id_uniq,
  ADD CONSTRAINT counterparty_contacts_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS counterparty_contacts_counterparty_tenant_fk,
  ADD CONSTRAINT counterparty_contacts_counterparty_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_id) REFERENCES crm.counterparties (tenant_id, id);

ALTER TABLE crm.counterparty_employees
  DROP CONSTRAINT IF EXISTS counterparty_employees_tenant_id_id_uniq,
  ADD CONSTRAINT counterparty_employees_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS counterparty_employees_counterparty_tenant_fk,
  ADD CONSTRAINT counterparty_employees_counterparty_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_id) REFERENCES crm.counterparties (tenant_id, id),
  DROP CONSTRAINT IF EXISTS counterparty_employees_contact_tenant_fk,
  ADD CONSTRAINT counterparty_employees_contact_tenant_fk
    FOREIGN KEY (tenant_id, contact_id) REFERENCES crm.counterparty_contacts (tenant_id, id);

ALTER TABLE learning.learners
  DROP CONSTRAINT IF EXISTS learners_tenant_id_id_uniq,
  ADD CONSTRAINT learners_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS learners_counterparty_tenant_fk,
  ADD CONSTRAINT learners_counterparty_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_id) REFERENCES crm.counterparties (tenant_id, id),
  DROP CONSTRAINT IF EXISTS learners_counterparty_employee_tenant_fk,
  ADD CONSTRAINT learners_counterparty_employee_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_employee_id) REFERENCES crm.counterparty_employees (tenant_id, id);

ALTER TABLE learning.directions
  DROP CONSTRAINT IF EXISTS directions_tenant_id_id_uniq,
  ADD CONSTRAINT directions_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS directions_parent_tenant_fk,
  ADD CONSTRAINT directions_parent_tenant_fk
    FOREIGN KEY (tenant_id, parent_direction_id) REFERENCES learning.directions (tenant_id, id);

ALTER TABLE learning.courses
  DROP CONSTRAINT IF EXISTS courses_tenant_id_id_uniq,
  ADD CONSTRAINT courses_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS courses_direction_tenant_fk,
  ADD CONSTRAINT courses_direction_tenant_fk
    FOREIGN KEY (tenant_id, direction_id) REFERENCES learning.directions (tenant_id, id);

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_tenant_id_id_uniq,
  ADD CONSTRAINT course_versions_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS course_versions_course_tenant_fk,
  ADD CONSTRAINT course_versions_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id);

ALTER TABLE learning.course_settings
  DROP CONSTRAINT IF EXISTS course_settings_course_tenant_fk,
  ADD CONSTRAINT course_settings_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id),
  DROP CONSTRAINT IF EXISTS course_settings_active_version_tenant_fk,
  ADD CONSTRAINT course_settings_active_version_tenant_fk
    FOREIGN KEY (tenant_id, active_version_id) REFERENCES learning.course_versions (tenant_id, id);

ALTER TABLE learning.course_modules
  DROP CONSTRAINT IF EXISTS course_modules_tenant_id_id_uniq,
  ADD CONSTRAINT course_modules_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS course_modules_version_tenant_fk,
  ADD CONSTRAINT course_modules_version_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id) REFERENCES learning.course_versions (tenant_id, id);

ALTER TABLE learning.materials
  DROP CONSTRAINT IF EXISTS materials_tenant_id_id_uniq,
  ADD CONSTRAINT materials_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS materials_module_tenant_fk,
  ADD CONSTRAINT materials_module_tenant_fk
    FOREIGN KEY (tenant_id, module_id) REFERENCES learning.course_modules (tenant_id, id);

ALTER TABLE learning.material_versions
  DROP CONSTRAINT IF EXISTS material_versions_tenant_id_id_uniq,
  ADD CONSTRAINT material_versions_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS material_versions_material_tenant_fk,
  ADD CONSTRAINT material_versions_material_tenant_fk
    FOREIGN KEY (tenant_id, material_id) REFERENCES learning.materials (tenant_id, id),
  DROP CONSTRAINT IF EXISTS material_versions_storage_file_tenant_fk,
  ADD CONSTRAINT material_versions_storage_file_tenant_fk
    FOREIGN KEY (tenant_id, storage_file_id) REFERENCES storage.files (tenant_id, id);

ALTER TABLE learning.study_groups
  DROP CONSTRAINT IF EXISTS study_groups_tenant_id_id_uniq,
  ADD CONSTRAINT study_groups_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE learning.group_courses
  DROP CONSTRAINT IF EXISTS group_courses_group_tenant_fk,
  ADD CONSTRAINT group_courses_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.study_groups (tenant_id, id),
  DROP CONSTRAINT IF EXISTS group_courses_course_tenant_fk,
  ADD CONSTRAINT group_courses_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id),
  DROP CONSTRAINT IF EXISTS group_courses_course_version_tenant_fk,
  ADD CONSTRAINT group_courses_course_version_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id) REFERENCES learning.course_versions (tenant_id, id);

ALTER TABLE learning.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_tenant_id_id_uniq,
  ADD CONSTRAINT enrollments_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS enrollments_group_tenant_fk,
  ADD CONSTRAINT enrollments_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.study_groups (tenant_id, id),
  DROP CONSTRAINT IF EXISTS enrollments_learner_tenant_fk,
  ADD CONSTRAINT enrollments_learner_tenant_fk
    FOREIGN KEY (tenant_id, learner_id) REFERENCES learning.learners (tenant_id, id),
  DROP CONSTRAINT IF EXISTS enrollments_completed_payload_chk,
  ADD CONSTRAINT enrollments_completed_payload_chk
    CHECK (status <> 'completed' OR completion_state IS NOT NULL);

ALTER TABLE learning.enrollment_status_history
  DROP CONSTRAINT IF EXISTS enrollment_status_history_enrollment_tenant_fk,
  ADD CONSTRAINT enrollment_status_history_enrollment_tenant_fk
    FOREIGN KEY (tenant_id, enrollment_id) REFERENCES learning.enrollments (tenant_id, id);

ALTER TABLE learning.course_progress
  DROP CONSTRAINT IF EXISTS course_progress_tenant_id_id_uniq,
  ADD CONSTRAINT course_progress_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS course_progress_enrollment_tenant_fk,
  ADD CONSTRAINT course_progress_enrollment_tenant_fk
    FOREIGN KEY (tenant_id, enrollment_id) REFERENCES learning.enrollments (tenant_id, id),
  DROP CONSTRAINT IF EXISTS course_progress_course_tenant_fk,
  ADD CONSTRAINT course_progress_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id);

ALTER TABLE learning.module_progress
  DROP CONSTRAINT IF EXISTS module_progress_tenant_id_id_uniq,
  ADD CONSTRAINT module_progress_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS module_progress_course_progress_tenant_fk,
  ADD CONSTRAINT module_progress_course_progress_tenant_fk
    FOREIGN KEY (tenant_id, course_progress_id) REFERENCES learning.course_progress (tenant_id, id),
  DROP CONSTRAINT IF EXISTS module_progress_module_tenant_fk,
  ADD CONSTRAINT module_progress_module_tenant_fk
    FOREIGN KEY (tenant_id, module_id) REFERENCES learning.course_modules (tenant_id, id);

ALTER TABLE learning.material_progress
  DROP CONSTRAINT IF EXISTS material_progress_module_progress_tenant_fk,
  ADD CONSTRAINT material_progress_module_progress_tenant_fk
    FOREIGN KEY (tenant_id, module_progress_id) REFERENCES learning.module_progress (tenant_id, id),
  DROP CONSTRAINT IF EXISTS material_progress_material_tenant_fk,
  ADD CONSTRAINT material_progress_material_tenant_fk
    FOREIGN KEY (tenant_id, material_id) REFERENCES learning.materials (tenant_id, id),
  DROP CONSTRAINT IF EXISTS material_progress_material_version_tenant_fk,
  ADD CONSTRAINT material_progress_material_version_tenant_fk
    FOREIGN KEY (tenant_id, material_version_id) REFERENCES learning.material_versions (tenant_id, id);

ALTER TABLE assessment.tests
  DROP CONSTRAINT IF EXISTS tests_tenant_id_id_uniq,
  ADD CONSTRAINT tests_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS tests_course_tenant_fk,
  ADD CONSTRAINT tests_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id),
  DROP CONSTRAINT IF EXISTS tests_course_version_tenant_fk,
  ADD CONSTRAINT tests_course_version_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id) REFERENCES learning.course_versions (tenant_id, id);

ALTER TABLE assessment.questions
  DROP CONSTRAINT IF EXISTS questions_tenant_id_id_uniq,
  ADD CONSTRAINT questions_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE assessment.answer_options
  DROP CONSTRAINT IF EXISTS answer_options_tenant_id_id_uniq,
  ADD CONSTRAINT answer_options_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS answer_options_question_tenant_fk,
  ADD CONSTRAINT answer_options_question_tenant_fk
    FOREIGN KEY (tenant_id, question_id) REFERENCES assessment.questions (tenant_id, id);

ALTER TABLE assessment.test_questions
  DROP CONSTRAINT IF EXISTS test_questions_test_tenant_fk,
  ADD CONSTRAINT test_questions_test_tenant_fk
    FOREIGN KEY (tenant_id, test_id) REFERENCES assessment.tests (tenant_id, id),
  DROP CONSTRAINT IF EXISTS test_questions_question_tenant_fk,
  ADD CONSTRAINT test_questions_question_tenant_fk
    FOREIGN KEY (tenant_id, question_id) REFERENCES assessment.questions (tenant_id, id);

ALTER TABLE assessment.test_attempts
  DROP CONSTRAINT IF EXISTS test_attempts_tenant_id_id_uniq,
  ADD CONSTRAINT test_attempts_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS test_attempts_test_tenant_fk,
  ADD CONSTRAINT test_attempts_test_tenant_fk
    FOREIGN KEY (tenant_id, test_id) REFERENCES assessment.tests (tenant_id, id),
  DROP CONSTRAINT IF EXISTS test_attempts_enrollment_tenant_fk,
  ADD CONSTRAINT test_attempts_enrollment_tenant_fk
    FOREIGN KEY (tenant_id, enrollment_id) REFERENCES learning.enrollments (tenant_id, id),
  DROP CONSTRAINT IF EXISTS test_attempts_learner_tenant_fk,
  ADD CONSTRAINT test_attempts_learner_tenant_fk
    FOREIGN KEY (tenant_id, learner_id) REFERENCES learning.learners (tenant_id, id),
  DROP CONSTRAINT IF EXISTS test_attempts_submitted_state_chk,
  ADD CONSTRAINT test_attempts_submitted_state_chk
    CHECK (status NOT IN ('submitted', 'evaluated') OR submitted_at IS NOT NULL),
  DROP CONSTRAINT IF EXISTS test_attempts_evaluated_state_chk,
  ADD CONSTRAINT test_attempts_evaluated_state_chk
    CHECK (status <> 'evaluated' OR completed_at IS NOT NULL);

ALTER TABLE assessment.attempt_answers
  DROP CONSTRAINT IF EXISTS attempt_answers_attempt_tenant_fk,
  ADD CONSTRAINT attempt_answers_attempt_tenant_fk
    FOREIGN KEY (tenant_id, attempt_id) REFERENCES assessment.test_attempts (tenant_id, id),
  DROP CONSTRAINT IF EXISTS attempt_answers_question_tenant_fk,
  ADD CONSTRAINT attempt_answers_question_tenant_fk
    FOREIGN KEY (tenant_id, question_id) REFERENCES assessment.questions (tenant_id, id),
  DROP CONSTRAINT IF EXISTS attempt_answers_option_tenant_fk,
  ADD CONSTRAINT attempt_answers_option_tenant_fk
    FOREIGN KEY (tenant_id, answer_option_id) REFERENCES assessment.answer_options (tenant_id, id);

ALTER TABLE assessment.exam_results
  DROP CONSTRAINT IF EXISTS exam_results_enrollment_tenant_fk,
  ADD CONSTRAINT exam_results_enrollment_tenant_fk
    FOREIGN KEY (tenant_id, enrollment_id) REFERENCES learning.enrollments (tenant_id, id),
  DROP CONSTRAINT IF EXISTS exam_results_learner_tenant_fk,
  ADD CONSTRAINT exam_results_learner_tenant_fk
    FOREIGN KEY (tenant_id, learner_id) REFERENCES learning.learners (tenant_id, id),
  DROP CONSTRAINT IF EXISTS exam_results_test_tenant_fk,
  ADD CONSTRAINT exam_results_test_tenant_fk
    FOREIGN KEY (tenant_id, test_id) REFERENCES assessment.tests (tenant_id, id),
  DROP CONSTRAINT IF EXISTS exam_results_best_attempt_tenant_fk,
  ADD CONSTRAINT exam_results_best_attempt_tenant_fk
    FOREIGN KEY (tenant_id, best_attempt_id) REFERENCES assessment.test_attempts (tenant_id, id);

ALTER TABLE documents.templates
  DROP CONSTRAINT IF EXISTS templates_tenant_id_id_uniq,
  ADD CONSTRAINT templates_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE documents.template_versions
  DROP CONSTRAINT IF EXISTS template_versions_tenant_id_id_uniq,
  ADD CONSTRAINT template_versions_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS template_versions_template_tenant_fk,
  ADD CONSTRAINT template_versions_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id) REFERENCES documents.templates (tenant_id, id),
  DROP CONSTRAINT IF EXISTS template_versions_storage_file_tenant_fk,
  ADD CONSTRAINT template_versions_storage_file_tenant_fk
    FOREIGN KEY (tenant_id, storage_file_id) REFERENCES storage.files (tenant_id, id);

ALTER TABLE documents.templates
  DROP CONSTRAINT IF EXISTS templates_active_version_fk,
  ADD CONSTRAINT templates_active_version_fk
    FOREIGN KEY (tenant_id, active_version_id) REFERENCES documents.template_versions (tenant_id, id);

ALTER TABLE documents.template_variables
  DROP CONSTRAINT IF EXISTS template_variables_template_tenant_fk,
  ADD CONSTRAINT template_variables_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id) REFERENCES documents.templates (tenant_id, id);

ALTER TABLE documents.template_bindings
  DROP CONSTRAINT IF EXISTS template_bindings_template_tenant_fk,
  ADD CONSTRAINT template_bindings_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id) REFERENCES documents.templates (tenant_id, id),
  DROP CONSTRAINT IF EXISTS template_bindings_direction_tenant_fk,
  ADD CONSTRAINT template_bindings_direction_tenant_fk
    FOREIGN KEY (tenant_id, direction_id) REFERENCES learning.directions (tenant_id, id),
  DROP CONSTRAINT IF EXISTS template_bindings_course_tenant_fk,
  ADD CONSTRAINT template_bindings_course_tenant_fk
    FOREIGN KEY (tenant_id, course_id) REFERENCES learning.courses (tenant_id, id),
  DROP CONSTRAINT IF EXISTS template_bindings_group_tenant_fk,
  ADD CONSTRAINT template_bindings_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.study_groups (tenant_id, id);

ALTER TABLE documents.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_tenant_id_id_uniq,
  ADD CONSTRAINT generated_documents_tenant_id_id_uniq UNIQUE (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_template_tenant_fk,
  ADD CONSTRAINT generated_documents_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id) REFERENCES documents.templates (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_template_version_tenant_fk,
  ADD CONSTRAINT generated_documents_template_version_tenant_fk
    FOREIGN KEY (tenant_id, template_version_id) REFERENCES documents.template_versions (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_learner_tenant_fk,
  ADD CONSTRAINT generated_documents_learner_tenant_fk
    FOREIGN KEY (tenant_id, learner_id) REFERENCES learning.learners (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_group_tenant_fk,
  ADD CONSTRAINT generated_documents_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.study_groups (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_counterparty_tenant_fk,
  ADD CONSTRAINT generated_documents_counterparty_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_id) REFERENCES crm.counterparties (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_storage_file_tenant_fk,
  ADD CONSTRAINT generated_documents_storage_file_tenant_fk
    FOREIGN KEY (tenant_id, storage_file_id) REFERENCES storage.files (tenant_id, id),
  DROP CONSTRAINT IF EXISTS generated_documents_final_state_chk,
  ADD CONSTRAINT generated_documents_final_state_chk
    CHECK (is_final = false OR status = 'final'),
  DROP CONSTRAINT IF EXISTS generated_documents_final_number_chk,
  ADD CONSTRAINT generated_documents_final_number_chk
    CHECK (is_final = false OR document_number IS NOT NULL);

ALTER TABLE documents.numbering_rules
  DROP CONSTRAINT IF EXISTS numbering_rules_tenant_id_id_uniq,
  ADD CONSTRAINT numbering_rules_tenant_id_id_uniq UNIQUE (tenant_id, id);

ALTER TABLE documents.number_reservations
  DROP CONSTRAINT IF EXISTS number_reservations_numbering_rule_tenant_fk,
  ADD CONSTRAINT number_reservations_numbering_rule_tenant_fk
    FOREIGN KEY (tenant_id, numbering_rule_id) REFERENCES documents.numbering_rules (tenant_id, id),
  DROP CONSTRAINT IF EXISTS number_reservations_generated_document_tenant_fk,
  ADD CONSTRAINT number_reservations_generated_document_tenant_fk
    FOREIGN KEY (tenant_id, generated_document_id) REFERENCES documents.generated_documents (tenant_id, id),
  DROP CONSTRAINT IF EXISTS number_reservations_consumed_at_chk,
  ADD CONSTRAINT number_reservations_consumed_at_chk
    CHECK (status <> 'consumed' OR consumed_at IS NOT NULL);

ALTER TABLE storage.files
  DROP CONSTRAINT IF EXISTS files_size_bytes_chk,
  ADD CONSTRAINT files_size_bytes_chk CHECK (size_bytes >= 0),
  DROP CONSTRAINT IF EXISTS files_uploaded_by_tenant_fk,
  ADD CONSTRAINT files_uploaded_by_tenant_fk
    FOREIGN KEY (tenant_id, uploaded_by_user_id) REFERENCES iam.users (tenant_id, id);

ALTER TABLE storage.file_links
  DROP CONSTRAINT IF EXISTS file_links_file_tenant_fk,
  ADD CONSTRAINT file_links_file_tenant_fk
    FOREIGN KEY (tenant_id, file_id) REFERENCES storage.files (tenant_id, id);

CREATE INDEX IF NOT EXISTS enrollments_tenant_status_completed_at_idx
  ON learning.enrollments (tenant_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS progress_last_activity_idx
  ON learning.course_progress (tenant_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS generated_documents_tenant_final_idx
  ON documents.generated_documents (tenant_id, is_final, document_date DESC);
