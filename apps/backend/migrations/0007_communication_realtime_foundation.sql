create schema if not exists communication;

create table if not exists communication.notifications (
  id text primary key,
  tenant_id text not null,
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

create table if not exists communication.notification_deliveries (
  id text primary key,
  tenant_id text not null,
  notification_id text not null,
  channel_code text not null,
  status text not null,
  provider_message_id text null,
  created_at timestamptz not null default now()
);

create table if not exists communication.chat_dialogs (
  id text primary key,
  tenant_id text not null,
  dialog_type text not null,
  related_entity_type text null,
  related_entity_id text null,
  assigned_user_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists communication.chat_participants (
  id text primary key,
  tenant_id text not null,
  dialog_id text not null,
  user_id text not null,
  participant_role text not null,
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists communication.chat_messages (
  id text primary key,
  tenant_id text not null,
  dialog_id text not null,
  sender_user_id text not null,
  message_type text not null,
  text_body text not null,
  sent_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null
);

create table if not exists communication.webinars (
  id text primary key,
  tenant_id text not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists communication.webinar_participants (
  id text primary key,
  tenant_id text not null,
  webinar_id text not null,
  user_id text null,
  learner_id text null,
  role_code text not null,
  attendance_status text not null,
  joined_at timestamptz null,
  left_at timestamptz null,
  duration_seconds integer null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_tenant_status on communication.notifications (tenant_id, status);
create index if not exists idx_notifications_tenant_created on communication.notifications (tenant_id, created_at);
create index if not exists idx_notifications_tenant_recipient on communication.notifications (tenant_id, recipient_user_id);
create index if not exists idx_chat_messages_tenant_dialog_sent on communication.chat_messages (tenant_id, dialog_id, sent_at);
create index if not exists idx_webinar_participants_tenant_webinar on communication.webinar_participants (tenant_id, webinar_id);
