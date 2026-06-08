-- 0049_communication_email_dedup_key.sql
-- Phase 5 Plan 5B-2 — per-milestone send-once dedup for graduated reminders.
-- dedup_key encodes feature:entity:milestone, e.g. 'recert:recert_ab12:30', 'deadline:enr_x:7',
-- 'revoked:gdoc_y'. NULL for pre-existing rows and any non-deduped send. The index is a plain
-- lookup index (NOT unique): a two-recipient dispatch shares one dedup_key, and the cron's
-- pg_try_advisory_xact_lock + per-tenant TenantSerialGateway serialization make check-then-send
-- race-free. The recertification_drafts unique constraint (0048) independently dedupes drafts.

alter table communication.email_deliveries
  add column if not exists dedup_key text;

create index if not exists idx_email_deliveries_tenant_dedup
  on communication.email_deliveries (tenant_id, dedup_key);
