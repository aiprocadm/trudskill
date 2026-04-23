create table if not exists iam.supertokens_user_bridge (
  id text primary key,
  tenant_id text not null,
  user_id text not null references iam.users (id) on delete cascade,
  supertokens_user_id text not null,
  password_migration_status text not null default 'pending',
  imported_hash_alg text,
  imported_hash_fingerprint text,
  rehash_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, user_id),
  unique (tenant_id, supertokens_user_id),
  constraint iam_supertokens_bridge_password_migration_chk
    check (password_migration_status in ('pending', 'imported', 'rehash_completed', 'failed'))
);

create index if not exists iam_supertokens_user_bridge_tenant_user_idx
  on iam.supertokens_user_bridge (tenant_id, user_id)
  where deleted_at is null;

create index if not exists iam_supertokens_user_bridge_tenant_st_user_idx
  on iam.supertokens_user_bridge (tenant_id, supertokens_user_id)
  where deleted_at is null;

create or replace function iam.touch_supertokens_user_bridge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_iam_supertokens_user_bridge_touch_updated_at on iam.supertokens_user_bridge;

create trigger trg_iam_supertokens_user_bridge_touch_updated_at
before update on iam.supertokens_user_bridge
for each row
execute function iam.touch_supertokens_user_bridge_updated_at();
