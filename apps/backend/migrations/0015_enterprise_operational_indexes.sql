-- ---------------------------------------------------------------------------
-- Enterprise operational indexes for queueing, idempotency and replay safety
-- ---------------------------------------------------------------------------
-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): schema-qualified every
-- COMMENT ON INDEX target. An index is created in its table's schema
-- (documents/integrations/core), none of which are on the default search_path,
-- so the unqualified COMMENT ON INDEX failed with "relation ... does not exist"
-- on a fresh DB. Safe to edit history: no DB is deployed. See
-- docs/superpowers/specs/2026-06-20-migration-chain-fresh-bootstrap-design.md

-- Job/task status timeline lookups (tenant-scoped dashboards and workers).
create index if not exists documents_document_tasks_tenant_status_created_idx
  on documents.document_tasks (tenant_id, status, created_at);
comment on index documents.documents_document_tasks_tenant_status_created_idx is
  'Operational: tenant-scoped task queue scans by status ordered by creation time.';

create index if not exists integrations_sync_jobs_tenant_status_created_idx
  on integrations.sync_jobs (tenant_id, status, requested_at);
comment on index integrations.integrations_sync_jobs_tenant_status_created_idx is
  'Operational: tenant-scoped sync job queue scans by status ordered by request time.';

create index if not exists integrations_dead_letters_tenant_status_created_idx
  on integrations.dead_letters (tenant_id, status, created_at);
comment on index integrations.integrations_dead_letters_tenant_status_created_idx is
  'Operational: tenant-scoped dead-letter processing backlog by status and creation time.';

-- Retry scheduling hot path (queued/retry work polling).
create index if not exists integrations_sync_jobs_tenant_next_retry_active_idx
  on integrations.sync_jobs (tenant_id, requested_at)
  where status in ('queued', 'retry');
comment on index integrations.integrations_sync_jobs_tenant_next_retry_active_idx is
  'Operational: active retry poller index for queued/retry sync jobs (next retry ordered by requested_at fallback).';

create index if not exists integrations_dead_letters_tenant_next_retry_active_idx
  on integrations.dead_letters (tenant_id, retry_after)
  where status in ('queued', 'retry');
comment on index integrations.integrations_dead_letters_tenant_next_retry_active_idx is
  'Operational: active retry poller index for queued/retry dead letters using retry_after as retry schedule.';

-- Idempotency key uniqueness (tenant+scope+hash).
create unique index if not exists integrations_idempotency_keys_tenant_scope_hash_uq
  on integrations.idempotency_keys (tenant_id, scope, key_hash);
comment on index integrations.integrations_idempotency_keys_tenant_scope_hash_uq is
  'Operational: idempotency uniqueness guard on tenant, scope and idempotency key hash.';

-- Active session/refresh token lookups (non-revoked, non-expired).
create index if not exists core_sessions_active_tenant_user_revoked_expires_idx
  on core.sessions (tenant_id, user_id, revoked_at, expires_at);
comment on index core.core_sessions_active_tenant_user_revoked_expires_idx is
  'Operational: active session lookup by tenant/user with revoked and expiry filtering.';

create index if not exists core_refresh_tokens_active_tenant_user_revoked_expires_idx
  on core.refresh_tokens (tenant_id, user_id, revoked_at, expires_at);
comment on index core.core_refresh_tokens_active_tenant_user_revoked_expires_idx is
  'Operational: active refresh token lookup by tenant/user with revoked and expiry filtering.';

-- Webhook replay de-duplication (tenant+provider+event uniqueness).
create unique index if not exists integrations_webhook_events_tenant_provider_event_uq
  on integrations.webhook_events (tenant_id, provider_id, event_key);
comment on index integrations.integrations_webhook_events_tenant_provider_event_uq is
  'Operational: webhook replay protection using tenant, provider and external event id uniqueness.';
