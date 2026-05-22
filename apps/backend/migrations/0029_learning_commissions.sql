-- migration 0029: attestation commissions for regulated training (Plan A, spec §5.2)
-- two tables:
--   learning.commissions          — атттестационная комиссия (code unique per tenant, active/archived)
--   learning.commission_members   — члены с ролями, internal user или внешний эксперт, опциональная подпись

CREATE TABLE IF NOT EXISTS learning.commissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT commissions_status_chk CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commissions_tenant_code_uniq UNIQUE (tenant_id, code),
  CONSTRAINT commissions_tenant_id_uniq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_tenant_status
  ON learning.commissions (tenant_id, status);

CREATE TABLE IF NOT EXISTS learning.commission_members (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  commission_id text NOT NULL,
  role text NOT NULL
    CONSTRAINT commission_members_role_chk CHECK (role IN ('chairman', 'deputy_chairman', 'member', 'secretary', 'external_expert')),
  user_id text REFERENCES iam.users(id),
  external_full_name text,
  external_position text,
  signature_file_id text REFERENCES storage.files(id),
  position_in_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_member_identity_chk
    CHECK (user_id IS NOT NULL OR external_full_name IS NOT NULL),
  CONSTRAINT commission_members_commission_tenant_fk
    FOREIGN KEY (tenant_id, commission_id)
    REFERENCES learning.commissions (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commission_members_commission
  ON learning.commission_members (tenant_id, commission_id, position_in_order);

COMMENT ON TABLE learning.commissions IS
  'Attestation commissions for regulated training (§5.2). Each course_version may attach one commission.';
COMMENT ON TABLE learning.commission_members IS
  'Members of attestation commissions. Either user_id (internal IAM user) or external_full_name + external_position.';
