-- Audit: optional JSON envelope for delegated learning (learners.act_as) and extensions.
ALTER TABLE audit.audit_log
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL;
