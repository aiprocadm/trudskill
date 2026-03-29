CREATE SCHEMA IF NOT EXISTS esign;

CREATE TABLE IF NOT EXISTS esign.esign_applications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  learner_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esign_applications_status_chk CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'reused')),
  CONSTRAINT esign_applications_learner_tenant_fk FOREIGN KEY (tenant_id, learner_id) REFERENCES learning.learners(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS esign_applications_tenant_status_idx
  ON esign.esign_applications (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS esign.esign_application_files (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  application_id text NOT NULL,
  file_id text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded',
  rejection_reason text,
  verified_by text,
  verified_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esign_application_files_status_chk CHECK (status IN ('uploaded', 'verified', 'rejected')),
  CONSTRAINT esign_application_files_verified_at_chk CHECK (status <> 'verified' OR verified_at IS NOT NULL),
  CONSTRAINT esign_application_files_tenant_application_fk FOREIGN KEY (tenant_id, application_id) REFERENCES esign.esign_applications (tenant_id, id),
  CONSTRAINT esign_application_files_tenant_file_fk FOREIGN KEY (tenant_id, file_id) REFERENCES storage.files (tenant_id, id),
  CONSTRAINT esign_application_files_unique_file_per_application UNIQUE (tenant_id, application_id, file_id)
);

CREATE INDEX IF NOT EXISTS esign_application_files_tenant_application_idx
  ON esign.esign_application_files (tenant_id, application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS esign.signing_processes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  application_id text,
  generated_document_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sequential boolean NOT NULL DEFAULT true,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  terminal_snapshot jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signing_processes_status_chk CHECK (status IN ('draft', 'prepared', 'awaiting_participants', 'in_signing', 'signed', 'failed', 'cancelled')),
  CONSTRAINT signing_processes_terminal_snapshot_chk CHECK (status NOT IN ('signed', 'failed', 'cancelled') OR terminal_snapshot IS NOT NULL),
  CONSTRAINT signing_processes_terminal_finished_chk CHECK (status NOT IN ('signed', 'failed', 'cancelled') OR finished_at IS NOT NULL),
  CONSTRAINT signing_processes_tenant_application_fk FOREIGN KEY (tenant_id, application_id) REFERENCES esign.esign_applications (tenant_id, id),
  CONSTRAINT signing_processes_tenant_generated_document_fk FOREIGN KEY (tenant_id, generated_document_id) REFERENCES documents.generated_documents (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS signing_processes_tenant_status_idx
  ON esign.signing_processes (tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS signing_processes_tenant_signed_document_uniq
  ON esign.signing_processes (tenant_id, generated_document_id)
  WHERE status = 'signed';

CREATE TABLE IF NOT EXISTS esign.signing_participants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  process_id text NOT NULL,
  participant_type text NOT NULL,
  participant_user_id text NOT NULL,
  sign_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  rejected_at timestamptz,
  skipped_at timestamptz,
  expires_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signing_participants_type_chk CHECK (participant_type IN ('learner', 'commission_member', 'employee')),
  CONSTRAINT signing_participants_status_chk CHECK (status IN ('pending', 'invited', 'viewed', 'signed', 'rejected', 'skipped', 'expired')),
  CONSTRAINT signing_participants_sign_order_chk CHECK (sign_order > 0),
  CONSTRAINT signing_participants_signed_at_chk CHECK (status <> 'signed' OR signed_at IS NOT NULL),
  CONSTRAINT signing_participants_tenant_process_fk FOREIGN KEY (tenant_id, process_id) REFERENCES esign.signing_processes (tenant_id, id),
  CONSTRAINT signing_participants_process_user_uniq UNIQUE (tenant_id, process_id, participant_user_id),
  CONSTRAINT signing_participants_process_order_uniq UNIQUE (tenant_id, process_id, sign_order)
);

CREATE INDEX IF NOT EXISTS signing_participants_tenant_process_idx
  ON esign.signing_participants (tenant_id, process_id, sign_order);

CREATE TABLE IF NOT EXISTS esign.signature_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  process_id text NOT NULL,
  participant_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_events_tenant_process_fk FOREIGN KEY (tenant_id, process_id) REFERENCES esign.signing_processes (tenant_id, id),
  CONSTRAINT signature_events_tenant_participant_fk FOREIGN KEY (tenant_id, participant_id) REFERENCES esign.signing_participants (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS signature_events_tenant_process_idx
  ON esign.signature_events (tenant_id, process_id, created_at DESC);

CREATE TABLE IF NOT EXISTS esign.legal_log_entries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  actor_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  description text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_log_entries_tenant_entity_idx
  ON esign.legal_log_entries (tenant_id, entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION esign.prevent_legal_log_updates()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'esign.legal_log_entries is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_log_entries_no_update ON esign.legal_log_entries;
CREATE TRIGGER legal_log_entries_no_update
  BEFORE UPDATE OR DELETE ON esign.legal_log_entries
  FOR EACH ROW EXECUTE FUNCTION esign.prevent_legal_log_updates();

CREATE OR REPLACE FUNCTION esign.prevent_signature_event_updates()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'esign.signature_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signature_events_no_update ON esign.signature_events;
CREATE TRIGGER signature_events_no_update
  BEFORE UPDATE OR DELETE ON esign.signature_events
  FOR EACH ROW EXECUTE FUNCTION esign.prevent_signature_event_updates();
