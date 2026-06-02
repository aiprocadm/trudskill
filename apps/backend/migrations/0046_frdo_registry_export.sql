-- migration 0046: ФИС ФРДО — классификатор видов документов (lookup), дата рождения слушателя.
-- Права переиспользуются из 0045 (regulatory.export.read/write) — новых прав нет.

-- 1. Провизорный классификатор видов документов об образовании (ДПО) для ФРДО.
--    PROVISIONAL — frdo_kind/exact_name сверить с офиц. шаблоном/перечнем ФРДО (Рособрнадзор) перед боевой отправкой.
CREATE TABLE IF NOT EXISTS lookup.frdo_document_kinds (
  code            text PRIMARY KEY,
  template_type   text NOT NULL,
  frdo_kind       text NOT NULL,
  education_level text NOT NULL,
  exact_name      text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frdo_kinds_template_type_chk CHECK (template_type IN ('certificate','diploma')),
  CONSTRAINT frdo_kinds_template_type_uniq UNIQUE (template_type)
);

INSERT INTO lookup.frdo_document_kinds (code, template_type, frdo_kind, education_level, exact_name) VALUES
  ('PK', 'certificate', 'Удостоверение о повышении квалификации',    'ДПО', 'Удостоверение о повышении квалификации'),
  ('PP', 'diploma',     'Диплом о профессиональной переподготовке',  'ДПО', 'Диплом о профессиональной переподготовке')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE lookup.frdo_document_kinds IS
  'PROVISIONAL классификатор видов документов ДПО для ФИС ФРДО (Рособрнадзор). Сверить с офиц. перечнем/шаблоном перед боевой отправкой.';

-- 2. Дата рождения слушателя — нужна ФРДО для идентификации лица (опционально, без backfill).
ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS date_of_birth date;
