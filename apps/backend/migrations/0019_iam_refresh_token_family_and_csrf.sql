alter table if exists iam.sessions
  add column if not exists jti text,
  add column if not exists parent_jti text,
  add column if not exists rotated_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists revoke_reason text,
  add column if not exists csrf_token_hash text;

update iam.sessions
set jti = coalesce(jti, id)
where jti is null;

alter table if exists iam.sessions
  alter column jti set not null;

create unique index if not exists iam_sessions_tenant_jti_uidx
  on iam.sessions (tenant_id, jti);

create index if not exists iam_sessions_tenant_parent_jti_idx
  on iam.sessions (tenant_id, parent_jti);

create index if not exists iam_sessions_tenant_refresh_hash_idx
  on iam.sessions (tenant_id, refresh_token_hash);
