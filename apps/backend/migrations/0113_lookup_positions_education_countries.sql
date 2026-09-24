-- 0113_lookup_positions_education_countries.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 2, срез 8.13 (МГ-C1.2 «Справочники», решения РМ80–РМ83).
--
-- ЗАЧЕМ. Должность, образование и гражданство слушателя были свободным текстом: «ИНЖЕНЕР»,
-- «инженер » и «Инженер» — три разных значения в отчётах, а выгрузка в ФРДО просит уровень
-- образования из фиксированного списка. Три справочника (§17 ТЗ):
--   • lookup.positions — должности НА ЦЕНТР (у каждого учебного центра свой словарь),
--     автопополнение при импорте и из мастера группы, уникальность без учёта регистра;
--   • lookup.education_levels — фиксированный список уровней ФРДО, глобальный, без POST;
--   • lookup.countries — страны (ISO 3166-1 alpha-2), глобальный; гражданство в карточке —
--     название текстом (список даёт подсказки, свободный ввод допустим).
-- Схема lookup уже есть (0030). Сиды — ON CONFLICT DO NOTHING: миграция повторяема.

CREATE TABLE IF NOT EXISTS lookup.positions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lookup_positions_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS lookup_positions_tenant_name_uniq
  ON lookup.positions (tenant_id, lower(name));

COMMENT ON TABLE lookup.positions IS
  'Должности слушателей учебного центра (МГ-C1.2): подсказки при вводе, автопополнение из импорта; уникальность без учёта регистра.';

CREATE TABLE IF NOT EXISTS lookup.education_levels (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lookup.education_levels IS
  'Уровни образования по классификации ФРДО (МГ-C1.2): фиксированный глобальный список, не на центр.';

INSERT INTO lookup.education_levels (code, name, sort_order) VALUES
  ('basic_general', 'Основное общее', 10),
  ('secondary_general', 'Среднее общее', 20),
  ('secondary_vocational', 'Среднее профессиональное', 30),
  ('higher_bachelor', 'Высшее — бакалавриат', 40),
  ('higher_specialist', 'Высшее — специалитет, магистратура', 50),
  ('higher_postgraduate', 'Высшее — подготовка кадров высшей квалификации', 60),
  ('other', 'Иное', 90)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS lookup.countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lookup.countries IS
  'Страны для гражданства (МГ-C1.2, РМ82): ISO 3166-1 alpha-2, глобальный список; Россия и ЕАЭС/СНГ первыми.';

INSERT INTO lookup.countries (code, name, sort_order) VALUES
  ('RU', 'Россия', 1),
  ('BY', 'Беларусь', 2),
  ('KZ', 'Казахстан', 3),
  ('KG', 'Киргизия', 4),
  ('AM', 'Армения', 5),
  ('UZ', 'Узбекистан', 6),
  ('TJ', 'Таджикистан', 7),
  ('TM', 'Туркменистан', 8),
  ('AZ', 'Азербайджан', 9),
  ('MD', 'Молдова', 10),
  ('GE', 'Грузия', 11),
  ('UA', 'Украина', 12),
  ('CN', 'Китай', 20),
  ('VN', 'Вьетнам', 21),
  ('IN', 'Индия', 22),
  ('TR', 'Турция', 23),
  ('MN', 'Монголия', 24),
  ('RS', 'Сербия', 25),
  ('DE', 'Германия', 26),
  ('IL', 'Израиль', 27),
  ('EG', 'Египет', 28),
  ('IR', 'Иран', 29),
  ('SY', 'Сирия', 30),
  ('KP', 'КНДР', 31)
ON CONFLICT (code) DO NOTHING;
