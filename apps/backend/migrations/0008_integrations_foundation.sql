create schema if not exists integration;

create table if not exists integration.providers (
  id text primary key,
  code text not null unique,
  name text not null,
  provider_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration.credentials (
  id text primary key,
  tenant_id text not null,
  provider_id text not null references integration.providers (id),
  name text not null,
  settings_jsonb jsonb not null default '{}'::jsonb,
  secret_encrypted text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id, name)
);

create table if not exists integration.export_tasks (
  id text primary key,
  tenant_id text not null,
  provider_code text not null,
  export_type text not null,
  source_filter_jsonb jsonb not null default '{}'::jsonb,
  status text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  result_file_id text null,
  response_payload_jsonb jsonb null,
  idempotency_key text null,
  constraint chk_export_task_status check (status in ('queued', 'running', 'completed', 'failed', 'partial_success', 'cancelled')),
  unique (tenant_id, idempotency_key)
);

create table if not exists integration.export_items (
  id text primary key,
  tenant_id text not null,
  task_id text not null references integration.export_tasks (id),
  entity_type text not null,
  entity_id text not null,
  status text not null,
  external_id text null,
  error_message text null,
  constraint chk_export_item_status check (status in ('queued', 'running', 'completed', 'failed', 'partial_success', 'cancelled'))
);

create table if not exists integration.sync_logs (
  id text primary key,
  tenant_id text not null,
  provider_code text not null,
  entity_type text not null,
  entity_id text not null,
  request_payload_jsonb jsonb null,
  response_payload_jsonb jsonb null,
  status_code integer not null,
  status text not null,
  task_id text null,
  created_at timestamptz not null default now()
);

create table if not exists integration.idempotency_records (
  id text primary key,
  tenant_id text not null,
  scope text not null,
  key_hash text not null,
  result_jsonb jsonb null,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, key_hash)
);

create index if not exists idx_credentials_tenant_status on integration.credentials (tenant_id, status);
create index if not exists idx_export_tasks_tenant_status on integration.export_tasks (tenant_id, status);
create index if not exists idx_export_tasks_tenant_created on integration.export_tasks (tenant_id, requested_at);
create index if not exists idx_export_tasks_tenant_provider_status on integration.export_tasks (tenant_id, provider_code, status);
create index if not exists idx_sync_logs_tenant_created on integration.sync_logs (tenant_id, created_at);
create index if not exists idx_sync_logs_tenant_provider_status on integration.sync_logs (tenant_id, provider_code, status);
-- sync_logs is kept with monotonic created_at index to enable future partitioning by created_at.
