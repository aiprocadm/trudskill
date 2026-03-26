-- Stage 9: documents bounded context foundation
create schema if not exists documents;

create table if not exists documents.templates (
  id text primary key,
  tenant_id text not null,
  name text not null,
  template_type text not null,
  description text,
  status text not null,
  current_version_id text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents.template_versions (
  id text primary key,
  tenant_id text not null,
  template_id text not null references documents.templates(id),
  version_no integer not null,
  file_id text not null,
  variables_schema_jsonb jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id, template_id, version_no)
);

create table if not exists documents.template_variables (
  id text primary key,
  tenant_id text not null,
  template_version_id text not null references documents.template_versions(id),
  variable_code text not null,
  display_name text not null,
  category_code text not null,
  data_type text not null,
  is_required boolean not null default false,
  description text,
  deleted_at timestamptz,
  unique (tenant_id, template_version_id, variable_code)
);

create table if not exists documents.template_bindings (
  id text primary key,
  tenant_id text not null,
  template_id text not null references documents.templates(id),
  bind_type text not null,
  direction_id text,
  course_id text,
  group_id text,
  attach_mode text not null,
  inherit_to_children boolean not null default false,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists documents.numbering_rules (
  id text primary key,
  tenant_id text not null,
  document_type text not null,
  prefix text not null default '',
  suffix text not null default '',
  pattern text not null,
  current_counter bigint not null default 0,
  reset_period text not null default 'none',
  is_active boolean not null default true,
  period_key text,
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_type, is_active)
);

create table if not exists documents.document_generation_tasks (
  id text primary key,
  tenant_id text not null,
  template_id text not null references documents.templates(id),
  template_version_id text references documents.template_versions(id),
  task_type text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  status text not null,
  requested_by text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  generated_document_id text
);

create table if not exists documents.generated_documents (
  id text primary key,
  tenant_id text not null,
  template_id text not null references documents.templates(id),
  template_version_id text not null references documents.template_versions(id),
  document_type text not null,
  name text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  file_id text not null,
  pdf_file_id text,
  status text not null,
  document_number text,
  document_date date,
  is_final boolean not null default false,
  generated_by text,
  generated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists documents.number_reservations (
  id text primary key,
  tenant_id text not null,
  rule_id text not null references documents.numbering_rules(id),
  document_id text references documents.generated_documents(id),
  reserved_number text not null,
  reserved_at timestamptz not null default now(),
  used_at timestamptz,
  status text not null
);

create index if not exists idx_documents_templates_tenant on documents.templates(tenant_id);
create index if not exists idx_documents_tasks_tenant_status on documents.document_generation_tasks(tenant_id, status);
create unique index if not exists uq_documents_reservation_number on documents.number_reservations(tenant_id, reserved_number);
