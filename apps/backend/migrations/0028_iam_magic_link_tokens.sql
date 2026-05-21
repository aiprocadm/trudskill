-- migration 0028: magic link tokens for passwordless authentication
-- one-time tokens that expire shortly after creation (~15 minutes)
-- stored as SHA-256 hashes; raw token only exists in the email link

create table if not exists iam.magic_link_tokens (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null,
  email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  redeemed_user_id text,
  request_ip text,
  request_user_agent text,
  redeem_ip text,
  redeem_user_agent text
);

create unique index if not exists iam_magic_link_tokens_token_hash_uidx
  on iam.magic_link_tokens (tenant_id, token_hash);

create index if not exists iam_magic_link_tokens_email_idx
  on iam.magic_link_tokens (tenant_id, email, expires_at desc);

create index if not exists iam_magic_link_tokens_cleanup_idx
  on iam.magic_link_tokens (expires_at)
  where consumed_at is null;

comment on table iam.magic_link_tokens is
  'Passwordless authentication tokens. Hash-only storage. 15-min lifetime by default.';
