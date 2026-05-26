-- 0035_org_training_licenses.sql
-- Pillar A Plan C §5.10 — лицензии и аккредитации учебного центра.
--
-- Новая схема org для организационных артефактов центра (отдельно от
-- learning/mvp/documents — это не учебные сущности, а юридические документы).
--
-- training_licenses:
--   license_type        — 'education_license' | 'accreditation' | 'sro_membership' | 'other'
--   permitted_training_types — NULL = универсальная лицензия, иначе подмножество TrainingType
--   permitted_directions    — NULL = все направления, иначе массив направлений
--   status              — 'active' | 'expired' | 'revoked'
--
-- Indexes:
--   tenant_status — для list endpoint с фильтрами.
--   valid_until partial — для будущего notification job'а (expiration warnings).

CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE IF NOT EXISTS org.training_licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  license_type text NOT NULL
    CONSTRAINT training_licenses_type_chk
      CHECK (license_type IN ('education_license', 'accreditation', 'sro_membership', 'other')),
  license_number text NOT NULL,
  issuer_name text NOT NULL,
  issued_at date NOT NULL,
  valid_until date,
  scan_file_id text,
  permitted_training_types text[],
  permitted_directions text[],
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT training_licenses_status_chk
      CHECK (status IN ('active', 'expired', 'revoked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_licenses_tenant_status
  ON org.training_licenses (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_training_licenses_valid_until
  ON org.training_licenses (tenant_id, valid_until)
  WHERE status = 'active';

COMMENT ON TABLE org.training_licenses IS
  'Pillar A §5.10 — образовательные лицензии, аккредитации, членство в СРО. Публикация программы blocked, если нет matching active license.';
