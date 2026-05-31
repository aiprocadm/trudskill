-- migration 0045: ОТ-реестр — классификатор программ (lookup), маппинг на курс, права.

-- 1. Глобальный классификатор программ обучения по ОТ (не мультитенантный, как regulatory_acts).
CREATE TABLE IF NOT EXISTS lookup.ot_training_programs (
  code         text PRIMARY KEY,
  registry_id  integer NOT NULL,
  exact_name   text NOT NULL,
  program_kind text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ot_programs_kind_chk CHECK (program_kind IN ('A','B','V','first_aid','siz','other')),
  CONSTRAINT ot_programs_registry_id_uniq UNIQUE (registry_id)
);

INSERT INTO lookup.ot_training_programs (code, registry_id, exact_name, program_kind) VALUES
  ('OT_A',          1, 'Обучение по общим вопросам охраны труда и функционирования системы управления охраной труда', 'A'),
  ('OT_B',          2, 'Обучение безопасным методам и приёмам выполнения работ при воздействии вредных и (или) опасных производственных факторов, источников опасности, идентифицированных в рамках специальной оценки условий труда и оценки профессиональных рисков', 'B'),
  ('OT_V',          3, 'Обучение безопасным методам и приёмам выполнения работ повышенной опасности', 'V'),
  ('OT_FIRST_AID',  4, 'Обучение по оказанию первой помощи пострадавшим', 'first_aid'),
  ('OT_SIZ',        5, 'Обучение по использованию (применению) средств индивидуальной защиты', 'siz')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE lookup.ot_training_programs IS
  'Классификатор программ обучения по ОТ (ПП 2464). registry_id/exact_name сверяются с официальным реестром Минтруда (ЛКОТ).';

-- 2. Маппинг версии курса → программы реестра (массив кодов, по аналогии с regulatory_basis_codes).
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS ot_program_codes text[];

-- 3. Права на формирование/загрузку выгрузки (выгрузка содержит ПДн → отдельное право).
INSERT INTO iam.permissions (id, code, description) VALUES
  ('p_regulatory_export_read',  'regulatory.export.read',  'Read regulatory export batches/records'),
  ('p_regulatory_export_write', 'regulatory.export.write', 'Create regulatory exports and import registry responses')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND (
    (r.code IN ('platform_admin','tenant_admin') AND p.code IN ('regulatory.export.read','regulatory.export.write'))
    OR (r.code IN ('methodist','manager') AND p.code = 'regulatory.export.read')
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
