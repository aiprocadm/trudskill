-- Stage-1 additive integrity hardening for normalized enterprise tables.
-- NOTE: Only additive changes; no edits to previously applied migrations.

-- ---------------------------------------------------------------------------
-- Foreign keys (where applicable) to normalized parent domains
-- ---------------------------------------------------------------------------
alter table learning.enrollments
  add constraint learning_enrollments_learner_id_fkey
  foreign key (learner_id) references core.users (id) not valid;

alter table assessment.attempts
  add constraint assessment_attempts_learner_id_fkey
  foreign key (learner_id) references core.users (id) not valid;

alter table assessment.submissions
  add constraint assessment_submissions_learner_id_fkey
  foreign key (learner_id) references core.users (id) not valid;

alter table assessment.reviews
  add constraint assessment_reviews_reviewer_user_id_fkey
  foreign key (reviewer_user_id) references core.users (id) not valid;

alter table comm.notifications
  add constraint comm_notifications_recipient_user_id_fkey
  foreign key (recipient_user_id) references core.users (id) not valid;

alter table comm.dialogs
  add constraint comm_dialogs_assigned_user_id_fkey
  foreign key (assigned_user_id) references core.users (id) not valid;

alter table comm.messages
  add constraint comm_messages_sender_user_id_fkey
  foreign key (sender_user_id) references core.users (id) not valid;

alter table comm.webinars
  add constraint comm_webinars_group_id_fkey
  foreign key (group_id) references learning.groups (id) not valid;

alter table comm.webinars
  add constraint comm_webinars_course_id_fkey
  foreign key (course_id) references learning.courses (id) not valid;

alter table comm.webinars
  add constraint comm_webinars_created_by_fkey
  foreign key (created_by) references core.users (id) not valid;

alter table comm.webinar_attendees
  add constraint comm_webinar_attendees_user_id_fkey
  foreign key (user_id) references core.users (id) not valid;

alter table integrations.sync_jobs
  add constraint integrations_sync_jobs_requested_by_fkey
  foreign key (requested_by) references core.users (id) not valid;

-- ---------------------------------------------------------------------------
-- Composite unique constraints for M:N-style relationships
-- ---------------------------------------------------------------------------
alter table learning.enrollments
  add constraint learning_enrollments_tenant_group_learner_uniq
  unique (tenant_id, group_id, learner_id);

alter table assessment.answers
  add constraint assessment_answers_tenant_attempt_question_uniq
  unique (tenant_id, attempt_id, question_id);

alter table assessment.results
  add constraint assessment_results_tenant_attempt_uniq
  unique (tenant_id, attempt_id);

create unique index comm_webinar_attendees_tenant_webinar_user_role_uniq
  on comm.webinar_attendees (tenant_id, webinar_id, user_id, role_code)
  where user_id is not null;

create unique index comm_webinar_attendees_tenant_webinar_learner_role_uniq
  on comm.webinar_attendees (tenant_id, webinar_id, learner_id, role_code)
  where learner_id is not null;

-- ---------------------------------------------------------------------------
-- Stage-1 auth/session expansion in core
-- Keep legacy iam.* tables working; dual-write is introduced in Stage-2.
-- ---------------------------------------------------------------------------
alter table core.sessions
  add column if not exists session_id text;

alter table core.sessions
  add column if not exists issued_at timestamptz;

alter table core.sessions
  add column if not exists user_agent text;

alter table core.sessions
  add column if not exists ip text;

alter table core.sessions
  add column if not exists rotated_from text;

update core.sessions
set
  session_id = coalesce(session_id, id),
  issued_at = coalesce(issued_at, created_at)
where session_id is null
   or issued_at is null;

alter table core.sessions
  alter column session_id set not null;

alter table core.sessions
  alter column issued_at set not null;

alter table core.sessions
  add constraint core_sessions_session_id_uniq
  unique (session_id);

alter table core.refresh_tokens
  add column if not exists token_hash text;

alter table core.refresh_tokens
  add column if not exists jti text;

alter table core.refresh_tokens
  add column if not exists nonce text;

alter table core.refresh_tokens
  add column if not exists consumed_at timestamptz;

alter table core.refresh_tokens
  add column if not exists reason text;

update core.refresh_tokens
set token_hash = coalesce(token_hash, refresh_token_hash)
where token_hash is null;

alter table core.refresh_tokens
  alter column token_hash set not null;

create index if not exists core_sessions_active_user_idx
  on core.sessions (tenant_id, user_id, expires_at desc)
  where revoked_at is null;

create index if not exists core_sessions_expires_at_cleanup_idx
  on core.sessions (expires_at);

create index if not exists core_refresh_tokens_hash_lookup_idx
  on core.refresh_tokens (tenant_id, token_hash);

create index if not exists core_refresh_tokens_jti_lookup_idx
  on core.refresh_tokens (tenant_id, jti)
  where jti is not null;

create index if not exists core_refresh_tokens_expires_at_cleanup_idx
  on core.refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- CHECK constraints: enum-like statuses
-- ---------------------------------------------------------------------------
alter table learning.courses
  add constraint learning_courses_status_chk
  check (status in ('draft', 'published', 'archived')) not valid;

alter table learning.course_versions
  add constraint learning_course_versions_status_chk
  check (status in ('draft', 'published', 'archived')) not valid;

alter table learning.groups
  add constraint learning_groups_status_chk
  check (status in ('draft', 'scheduled', 'active', 'completed', 'archived')) not valid;

alter table learning.enrollments
  add constraint learning_enrollments_status_chk
  check (status in ('pending', 'active', 'completed', 'cancelled')) not valid;

alter table learning.progress
  add constraint learning_progress_status_chk
  check (status in ('not_started', 'in_progress', 'completed', 'failed')) not valid;

alter table assessment.tests
  add constraint assessment_tests_status_chk
  check (status in ('draft', 'published', 'archived')) not valid;

alter table assessment.attempts
  add constraint assessment_attempts_status_chk
  check (status in ('started', 'submitted', 'graded', 'cancelled')) not valid;

alter table assessment.submissions
  add constraint assessment_submissions_status_chk
  check (status in ('submitted', 'in_review', 'reviewed', 'rejected')) not valid;

alter table assessment.reviews
  add constraint assessment_reviews_status_chk
  check (status in ('draft', 'completed')) not valid;

alter table documents.templates
  add constraint documents_templates_status_chk
  check (status in ('draft', 'published', 'archived')) not valid;

alter table documents.template_versions
  add constraint documents_template_versions_status_chk
  check (status in ('draft', 'published', 'archived')) not valid;

alter table documents.generated_documents
  add constraint documents_generated_documents_status_chk
  check (status in ('draft', 'generated', 'issued', 'void')) not valid;

alter table documents.document_tasks
  add constraint documents_document_tasks_status_chk
  check (status in ('pending', 'in_progress', 'completed', 'failed', 'cancelled')) not valid;

alter table integrations.credentials
  add constraint integrations_credentials_status_chk
  check (status in ('active', 'inactive', 'error')) not valid;

alter table integrations.sync_jobs
  add constraint integrations_sync_jobs_status_chk
  check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')) not valid;

alter table integrations.sync_logs
  add constraint integrations_sync_logs_status_chk
  check (status in ('ok', 'error')) not valid;

alter table integrations.webhook_events
  add constraint integrations_webhook_events_status_chk
  check (status in ('received', 'processed', 'failed')) not valid;

alter table integrations.dead_letters
  add constraint integrations_dead_letters_status_chk
  check (status in ('new', 'retrying', 'resolved', 'discarded')) not valid;

alter table comm.notifications
  add constraint comm_notifications_status_chk
  check (status in ('pending', 'sent', 'failed', 'read')) not valid;

alter table comm.notification_receipts
  add constraint comm_notification_receipts_status_chk
  check (status in ('pending', 'sent', 'delivered', 'failed')) not valid;

alter table comm.webinars
  add constraint comm_webinars_status_chk
  check (status in ('scheduled', 'live', 'completed', 'cancelled')) not valid;

alter table comm.webinar_attendees
  add constraint comm_webinar_attendees_attendance_status_chk
  check (attendance_status in ('invited', 'registered', 'attended', 'missed', 'cancelled')) not valid;

-- ---------------------------------------------------------------------------
-- CHECK constraints: temporal consistency
-- ---------------------------------------------------------------------------
alter table core.sessions
  add constraint core_sessions_expires_after_created_chk
  check (expires_at > created_at) not valid;

alter table core.refresh_tokens
  add constraint core_refresh_tokens_expires_after_created_chk
  check (expires_at > created_at) not valid;

alter table core.refresh_tokens
  add constraint core_refresh_tokens_revoked_after_created_chk
  check (revoked_at is null or revoked_at >= created_at) not valid;

alter table core.sessions
  add constraint core_sessions_expires_after_issued_chk
  check (expires_at > issued_at) not valid;

alter table core.sessions
  add constraint core_sessions_revoked_after_issued_chk
  check (revoked_at is null or revoked_at >= issued_at) not valid;

alter table core.refresh_tokens
  add constraint core_refresh_tokens_consumed_after_created_chk
  check (consumed_at is null or consumed_at >= created_at) not valid;

alter table learning.groups
  add constraint learning_groups_starts_before_ends_chk
  check (starts_at is null or ends_at is null or starts_at <= ends_at) not valid;

alter table comm.webinars
  add constraint comm_webinars_planned_start_before_end_chk
  check (planned_start_at < planned_end_at) not valid;

alter table comm.webinar_attendees
  add constraint comm_webinar_attendees_joined_before_left_chk
  check (joined_at is null or left_at is null or joined_at <= left_at) not valid;

alter table integrations.sync_jobs
  add constraint integrations_sync_jobs_requested_before_started_chk
  check (started_at is null or requested_at <= started_at) not valid;

alter table integrations.sync_jobs
  add constraint integrations_sync_jobs_started_before_finished_chk
  check (finished_at is null or started_at is null or started_at <= finished_at) not valid;
