create schema if not exists migration;

create table if not exists migration.backfill_runs (
  id uuid primary key,
  domain text not null,
  status text not null default 'pending',
  batch_size integer not null,
  checkpoint_tenant_id text,
  checkpoint_collection text,
  checkpoint_id text,
  processed_count bigint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_backfill_runs_status_created
  on migration.backfill_runs (status, created_at desc);

create table if not exists migration.backfill_items (
  id bigserial primary key,
  run_id uuid not null references migration.backfill_runs(id) on delete cascade,
  domain text not null,
  tenant_id text not null,
  collection text not null,
  entity_id text not null,
  source_hash text,
  target_hash text,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, domain, tenant_id, collection, entity_id)
);

create index if not exists idx_backfill_items_lookup
  on migration.backfill_items (run_id, tenant_id, collection, entity_id);

create table if not exists migration.reconciliation_reports (
  id uuid primary key,
  run_id uuid not null references migration.backfill_runs(id) on delete cascade,
  domain text not null,
  report_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);
