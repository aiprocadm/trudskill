-- migration 0030: program meta on course_versions + lookup.regulatory_acts + course_document_sets
-- Plan A, spec §5.1 and §5.3.
--
-- 1) Lookup schema + global regulatory_acts table with seed of 6 acts.
-- 2) Extends learning.course_versions with 8 nullable program meta fields, CHECK constraints,
--    and composite FK to learning.commissions (filled by migration 0029).
-- 3) New table learning.course_document_sets — per course_version configuration of the
--    document package issued on enrollment completion (one row per template).

-- 1. Lookup schema + regulatory_acts (global, not multi-tenant)
CREATE SCHEMA IF NOT EXISTS lookup;

CREATE TABLE IF NOT EXISTS lookup.regulatory_acts (
  code text PRIMARY KEY,
  short_name text NOT NULL,
  full_name text NOT NULL,
  issuing_authority text NOT NULL,
  issued_at date,
  url text,
  applies_to_verticals text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lookup.regulatory_acts (code, short_name, full_name, issuing_authority, issued_at, applies_to_verticals)
VALUES
  ('PP_2464_2022', 'ПП 2464', 'Постановление Правительства РФ от 24.12.2022 №2464 «О порядке обучения по охране труда»', 'Правительство РФ', '2022-12-24', ARRAY['ot']),
  ('PRIKAZ_26N_2024', 'Приказ Минтруда 26н', 'Приказ Минтруда РФ от 17.01.2024 №26н', 'Минтруд России', '2024-01-17', ARRAY['ot']),
  ('FZ_116_1997', 'ФЗ-116', 'Федеральный закон от 21.07.1997 №116-ФЗ «О промышленной безопасности опасных производственных объектов»', 'Государственная Дума РФ', '1997-07-21', ARRAY['pb']),
  ('PP_2168_2022', 'ПП 2168', 'Постановление Правительства РФ от 29.11.2022 №2168 «О порядке аттестации в области промышленной безопасности»', 'Правительство РФ', '2022-11-29', ARRAY['pb']),
  ('PRIKAZ_707N_2015', 'Приказ Минздрава 707н', 'Приказ Минздрава РФ от 08.10.2015 №707н', 'Минздрав России', '2015-10-08', ARRAY['nmo']),
  ('FZ_273_2012_ART_196', 'ФЗ-273 ст.196', 'Федеральный закон от 29.12.2012 №273-ФЗ «Об образовании в РФ», ст. 196 — ДПО', 'Государственная Дума РФ', '2012-12-29', ARRAY['ot', 'pb', 'nmo', 'emergency', 'other'])
ON CONFLICT (code) DO NOTHING;

-- 2. Extend learning.course_versions with program meta (§5.1)
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS academic_hours integer,
  ADD COLUMN IF NOT EXISTS training_type text,
  ADD COLUMN IF NOT EXISTS learner_category text,
  ADD COLUMN IF NOT EXISTS study_form text,
  ADD COLUMN IF NOT EXISTS final_assessment_form text,
  ADD COLUMN IF NOT EXISTS regulatory_basis_codes text[],
  ADD COLUMN IF NOT EXISTS program_attachment_file_id text,
  ADD COLUMN IF NOT EXISTS commission_id text;

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_training_type_chk,
  ADD CONSTRAINT course_versions_training_type_chk
    CHECK (training_type IS NULL OR training_type IN ('primary', 'repeat', 'target', 'extraordinary'));

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_learner_category_chk,
  ADD CONSTRAINT course_versions_learner_category_chk
    CHECK (learner_category IS NULL OR learner_category IN ('worker', 'specialist', 'manager', 'mixed'));

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_study_form_chk,
  ADD CONSTRAINT course_versions_study_form_chk
    CHECK (study_form IS NULL OR study_form IN ('in_person', 'distance', 'blended'));

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_final_assessment_chk,
  ADD CONSTRAINT course_versions_final_assessment_chk
    CHECK (final_assessment_form IS NULL OR final_assessment_form IN ('test', 'exam', 'defense', 'interview'));

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_academic_hours_chk,
  ADD CONSTRAINT course_versions_academic_hours_chk
    CHECK (academic_hours IS NULL OR academic_hours > 0);

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_program_attachment_file_fk,
  ADD CONSTRAINT course_versions_program_attachment_file_fk
    FOREIGN KEY (tenant_id, program_attachment_file_id)
    REFERENCES storage.files (tenant_id, id);

ALTER TABLE learning.course_versions
  DROP CONSTRAINT IF EXISTS course_versions_commission_tenant_fk,
  ADD CONSTRAINT course_versions_commission_tenant_fk
    FOREIGN KEY (tenant_id, commission_id)
    REFERENCES learning.commissions (tenant_id, id);

-- 3. course_document_sets — per course_version document package (§5.3)
CREATE TABLE IF NOT EXISTS learning.course_document_sets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_version_id text NOT NULL,
  template_id text NOT NULL,
  position smallint NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  auto_issue_on_completion boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_doc_sets_course_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id)
    REFERENCES learning.course_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT course_doc_sets_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES documents.templates (tenant_id, id),
  CONSTRAINT course_doc_sets_position_uniq UNIQUE (tenant_id, course_version_id, position),
  CONSTRAINT course_doc_sets_position_chk CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_course_doc_sets_course_version
  ON learning.course_document_sets (tenant_id, course_version_id, position);

COMMENT ON SCHEMA lookup IS
  'Global lookup tables (regulatory acts, etc.) not scoped to tenants.';
COMMENT ON TABLE lookup.regulatory_acts IS
  'Regulatory acts (ПП 2464, ФЗ-116, ...) referenced by course_versions.regulatory_basis_codes.';
COMMENT ON TABLE learning.course_document_sets IS
  'Per course_version document package: which templates are issued on enrollment completion (§5.3).';
