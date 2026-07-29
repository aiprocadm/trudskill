-- Фаза 3 Task 6 (ФТ-C3.2): раздельные согласия на ПДн и на фото.
--
-- Здесь ТОЛЬКО тексты согласий, редактируемые тенантом. Сами ФАКТЫ согласия и отзыва
-- пишутся в существующий юридический журнал `esign.legal_log_entries` (append-only,
-- миграция 0004) — второго журнала доказательств не заводим, как и в Task 3 с ПЭП:
-- копия доказательной цепочки неизбежно разойдётся с оригиналом.
--
-- Форма таблицы — зеркало `learning.esignature_agreements` (0067): версия никогда не
-- переписывается, рядом лежит хэш нормализованного текста. Хэш нужен, чтобы правка
-- пробелов или переносов НЕ заставляла всех слушателей давать согласие заново, а
-- изменение смысла — заставляла.
--
-- Почему согласий два. Фотография лица — это уже почти биометрия: зона, где человек
-- вправе сказать «данные обрабатывайте, но снимать меня не надо». Одна общая галочка
-- такого выбора не даёт и делает согласие недействительным по существу.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.consent_texts (
  tenant_id text NOT NULL,
  -- 'pii'   — обработка персональных данных (152-ФЗ);
  -- 'photo' — фото/изображение лица (селфи и разворот паспорта).
  kind text NOT NULL,
  version integer NOT NULL,
  body text NOT NULL,
  body_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind, version),
  CONSTRAINT consent_texts_kind_chk CHECK (kind IN ('pii', 'photo'))
);

COMMENT ON TABLE learning.consent_texts IS
  'Фаза 3 Task 6: тексты согласий (ПДн и фото), редактируемые тенантом. Факты согласия/отзыва — в esign.legal_log_entries.';

-- «Действующий текст этого вида у этого тенанта» — запрос на каждом показе формы.
CREATE INDEX IF NOT EXISTS idx_consent_texts_current
  ON learning.consent_texts (tenant_id, kind, version DESC);

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_consents_configure', 'consents.configure', 'Edit tenant consent texts (PII and photo)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND p.code = 'consents.configure'
  -- Текст согласия — юридический документ центра, а не учебный материал:
  -- править его может администрация, но не методист и тем более не слушатель.
  AND r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
