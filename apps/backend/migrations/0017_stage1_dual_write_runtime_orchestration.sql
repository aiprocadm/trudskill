-- Stage-1 runtime orchestration storage for dual-write and shadow-read reconciliation.

create table if not exists learning.mvp_stage1_runtime_documents (
  tenant_id text not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, collection, id)
);

create index if not exists idx_mvp_stage1_runtime_documents_tenant_collection
  on learning.mvp_stage1_runtime_documents (tenant_id, collection);

create table if not exists learning.mvp_reconciliation_log (
  id bigserial primary key,
  tenant_id text not null,
  issue_type text not null,
  collection text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mvp_reconciliation_log_tenant_created
  on learning.mvp_reconciliation_log (tenant_id, created_at desc);

create table if not exists documents.stage1_runtime_documents (
  tenant_id text not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, collection, id)
);

create index if not exists idx_documents_stage1_runtime_documents_tenant_collection
  on documents.stage1_runtime_documents (tenant_id, collection);

create table if not exists documents.reconciliation_log (
  id bigserial primary key,
  tenant_id text not null,
  issue_type text not null,
  collection text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_reconciliation_log_tenant_created
  on documents.reconciliation_log (tenant_id, created_at desc);
