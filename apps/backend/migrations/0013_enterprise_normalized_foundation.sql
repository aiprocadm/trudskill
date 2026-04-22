-- Additive migration introducing normalized enterprise schemas/tables.
-- Legacy schemas/tables remain intact (`integration`, `communication`, etc.).

create schema if not exists integrations;
create schema if not exists comm;

-- ---------------------------------------------------------------------------
-- core (normalized IAM projection)
-- ---------------------------------------------------------------------------
create table if not exists core.users (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  login text not null,
  email text null,
  password_hash text not null,
  status text not null,
  display_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, login)
);

create unique index if not exists core_users_tenant_email_uniq
  on core.users (tenant_id, email)
  where email is not null;

create table if not exists core.roles (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text not null,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists core.permissions (
  id text primary key,
  code text not null unique,
  description text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.user_roles (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  user_id text not null references core.users (id),
  role_id text not null references core.roles (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id)
);

create table if not exists core.sessions (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  user_id text not null references core.users (id),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.refresh_tokens (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  session_id text not null references core.sessions (id),
  user_id text not null references core.users (id),
  refresh_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, refresh_token_hash)
);

-- ---------------------------------------------------------------------------
-- learning
-- ---------------------------------------------------------------------------
create table if not exists learning.courses (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text not null,
  title text not null,
  description text null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists learning.course_versions (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  course_id text not null references learning.courses (id),
  version_no integer not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, course_id, version_no)
);

create table if not exists learning.course_modules (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  course_version_id text not null references learning.course_versions (id),
  code text null,
  title text not null,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning.materials (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  module_id text not null references learning.course_modules (id),
  code text null,
  title text not null,
  material_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning.groups (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text not null,
  name text not null,
  status text not null default 'draft',
  starts_at timestamptz null,
  ends_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, code)
);

create table if not exists learning.enrollments (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  group_id text not null references learning.groups (id),
  learner_id text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, learner_id)
);

create table if not exists learning.progress (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  enrollment_id text not null references learning.enrollments (id),
  course_id text null references learning.courses (id),
  module_id text null references learning.course_modules (id),
  material_id text null references learning.materials (id),
  status text not null default 'not_started',
  progress_percent numeric(5,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- assessment
-- ---------------------------------------------------------------------------
create table if not exists assessment.tests (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text null,
  title text not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.questions (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  test_id text null references assessment.tests (id),
  question_type text not null,
  prompt text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.attempts (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  test_id text not null references assessment.tests (id),
  learner_id text not null,
  status text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.answers (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  attempt_id text not null references assessment.attempts (id),
  question_id text not null references assessment.questions (id),
  answer_jsonb jsonb not null default '{}'::jsonb,
  score numeric(8,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.results (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  attempt_id text not null references assessment.attempts (id),
  total_score numeric(8,2) null,
  passed boolean null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id)
);

create table if not exists assessment.assignments (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text null,
  title text not null,
  description text null,
  due_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.submissions (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  assignment_id text not null references assessment.assignments (id),
  learner_id text not null,
  content_jsonb jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment.reviews (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  submission_id text not null references assessment.submissions (id),
  reviewer_user_id text not null,
  score numeric(8,2) null,
  feedback text null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table if not exists documents.templates (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  code text not null,
  name text not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists documents.template_versions (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  template_id text not null references documents.templates (id),
  version_no integer not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, template_id, version_no)
);

create table if not exists documents.generated_documents (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  template_id text null references documents.templates (id),
  template_version_id text null references documents.template_versions (id),
  document_no text null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents.document_tasks (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  generated_document_id text null references documents.generated_documents (id),
  task_type text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents.numbering_rules (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  document_type text not null,
  prefix text null,
  pattern text not null,
  is_active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_type)
);

create table if not exists documents.document_counters (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  rule_id text not null references documents.numbering_rules (id),
  period_key text not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, rule_id, period_key)
);

-- ---------------------------------------------------------------------------
-- integrations (new schema, legacy integration.* stays intact)
-- ---------------------------------------------------------------------------
create table if not exists integrations.providers (
  id text primary key,
  code text not null unique,
  name text not null,
  provider_type text not null,
  is_active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integrations.credentials (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  provider_id text not null references integrations.providers (id),
  name text not null,
  settings_jsonb jsonb not null default '{}'::jsonb,
  secret_encrypted text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id, name)
);

create table if not exists integrations.sync_jobs (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  provider_id text null references integrations.providers (id),
  credential_id text null references integrations.credentials (id),
  job_type text not null,
  status text not null,
  idempotency_key text null,
  requested_by text null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists integrations.sync_logs (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  sync_job_id text null references integrations.sync_jobs (id),
  provider_id text null references integrations.providers (id),
  status text not null,
  status_code integer null,
  request_payload_jsonb jsonb null,
  response_payload_jsonb jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists integrations.idempotency_keys (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  scope text not null,
  key_hash text not null,
  response_jsonb jsonb null,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, key_hash)
);

create table if not exists integrations.webhook_events (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  provider_id text null references integrations.providers (id),
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  unique (tenant_id, event_key)
);

create table if not exists integrations.dead_letters (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  source_type text not null,
  source_id text null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  retry_after timestamptz null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

-- ---------------------------------------------------------------------------
-- comm (new schema, legacy communication.* stays intact)
-- ---------------------------------------------------------------------------
create table if not exists comm.notifications (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  recipient_user_id text null,
  recipient_learner_id text null,
  channel_code text not null,
  subject_text text not null,
  body_text text not null,
  status text not null,
  related_entity_type text null,
  related_entity_id text null,
  metadata_jsonb jsonb null,
  payload_jsonb jsonb null,
  sent_at timestamptz null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists comm.notification_receipts (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  notification_id text not null references comm.notifications (id),
  channel_code text not null,
  status text not null,
  provider_message_id text null,
  created_at timestamptz not null default now()
);

create table if not exists comm.dialogs (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  dialog_type text not null,
  related_entity_type text null,
  related_entity_id text null,
  assigned_user_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comm.messages (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  dialog_id text not null references comm.dialogs (id),
  sender_user_id text not null,
  message_type text not null,
  text_body text not null,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null
);

create table if not exists comm.webinars (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  group_id text null,
  course_id text null,
  title text not null,
  description text null,
  provider_code text null,
  provider_session_id text null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  join_url text null,
  host_url text null,
  status text not null,
  created_by text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comm.webinar_attendees (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  webinar_id text not null references comm.webinars (id),
  user_id text null,
  learner_id text null,
  role_code text not null,
  attendance_status text not null,
  joined_at timestamptz null,
  left_at timestamptz null,
  duration_seconds integer null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compatibility views for progressive repository-adapter rollout
-- ---------------------------------------------------------------------------
create or replace view integrations.legacy_export_tasks as
select
  t.id,
  t.tenant_id,
  t.provider_code,
  t.export_type,
  t.source_filter_jsonb,
  t.status,
  t.requested_by,
  t.requested_at,
  t.started_at,
  t.finished_at,
  t.result_file_id,
  t.response_payload_jsonb,
  t.idempotency_key
from integration.export_tasks t;

create or replace view integrations.legacy_export_items as
select
  i.id,
  i.tenant_id,
  i.task_id,
  i.entity_type,
  i.entity_id,
  i.status,
  i.external_id,
  i.error_message
from integration.export_items i;

create or replace view comm.legacy_notification_deliveries as
select
  d.id,
  d.tenant_id,
  d.notification_id,
  d.channel_code,
  d.status,
  d.provider_message_id,
  d.created_at
from communication.notification_deliveries d;

create or replace view comm.legacy_chat_dialogs as
select
  d.id,
  d.tenant_id,
  d.dialog_type,
  d.related_entity_type,
  d.related_entity_id,
  d.assigned_user_id,
  d.created_at,
  d.updated_at
from communication.chat_dialogs d;

create or replace view comm.legacy_chat_messages as
select
  m.id,
  m.tenant_id,
  m.dialog_id,
  m.sender_user_id,
  m.message_type,
  m.text_body,
  m.sent_at,
  m.edited_at,
  m.deleted_at
from communication.chat_messages m;
