-- 0069_learning_consents.sql
-- Фаза 3 «Идентификация», Task 6 (ФТ-C3.2) — РАЗДЕЛЬНЫЕ согласия: на обработку
-- персональных данных и отдельно на фото/изображение.
--
-- Что было: единственный `consent_at` в `learning.identity_verifications` (0050) —
-- одна галочка «согласен на всё». Отозвать согласие на фото, не отзывая согласия на
-- обработку данных, было невозможно, а это разные по смыслу и по последствиям вещи:
-- фото лица — зона, граничащая с биометрией.
--
-- Форма скопирована с ПЭП-контура (`0067`): текст согласия редактируется тенантом и
-- версионируется, факт согласия хранит ХЭШ ИМЕННО ТОГО текста, который человек видел.
-- Ссылка на «согласие тенанта» через год не доказывает ничего — хэш доказывает.
--
-- Ключ факта — СЛУШАТЕЛЬ, а не пользователь (в отличие от `0067`): согласие даётся в
-- контуре подтверждения личности, который весь построен вокруг `learner_id`, и у
-- слушателя может не быть учётной записи вовсе.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.consent_documents (
  tenant_id text NOT NULL,
  -- 'personal_data' — обработка ПДн (152-ФЗ); 'photo' — фото/изображение лица.
  kind text NOT NULL,
  -- Версия растёт при КАЖДОМ изменении текста: данное согласие должно оставаться
  -- доказуемым, поэтому старые строки не переписываются.
  version integer NOT NULL,
  body text NOT NULL,
  -- SHA-256 нормализованного текста; вычисляется приложением.
  body_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_documents_pk PRIMARY KEY (tenant_id, kind, version),
  CONSTRAINT consent_documents_kind_chk CHECK (kind IN ('personal_data', 'photo'))
);

CREATE TABLE IF NOT EXISTS learning.consent_facts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  learner_id text NOT NULL,
  kind text NOT NULL,
  -- NULL = историческое согласие, перенесённое из `identity_verifications`: текста
  -- согласия в системе тогда не существовало, и приписывать ему версию значило бы
  -- сфабриковать доказательство.
  document_version integer NULL,
  body_hash text NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  -- Отзыв не удаляет строку: отозванное согласие остаётся доказательством того, что
  -- в тот период обработка была законной.
  revoked_at timestamptz NULL,
  ip text NULL,
  user_agent text NULL,
  CONSTRAINT consent_facts_kind_chk CHECK (kind IN ('personal_data', 'photo'))
);

-- «Действует ли сейчас согласие этого слушателя» — запрос на каждой подаче документов.
CREATE INDEX IF NOT EXISTS idx_consent_facts_learner
  ON learning.consent_facts (tenant_id, learner_id, kind, granted_at DESC);

-- ─── Перенос существующих согласий ──────────────────────────────────────────
-- Согласие на ПДн: всё, что уже было в `consent_at`.
INSERT INTO learning.consent_facts (id, tenant_id, learner_id, kind, granted_at)
SELECT concat('cfact_pd_', v.id), v.tenant_id, v.learner_id, 'personal_data', v.consent_at
FROM learning.identity_verifications v
WHERE v.consent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM learning.consent_facts f
    WHERE f.tenant_id = v.tenant_id AND f.learner_id = v.learner_id AND f.kind = 'personal_data'
  )
ON CONFLICT (id) DO NOTHING;

-- Согласие на фото: ТОЛЬКО там, где фото реально загружено. Иначе мы задним числом
-- «получили» согласие, которого человек не давал.
INSERT INTO learning.consent_facts (id, tenant_id, learner_id, kind, granted_at)
SELECT concat('cfact_ph_', v.id), v.tenant_id, v.learner_id, 'photo', v.consent_at
FROM learning.identity_verifications v
WHERE v.consent_at IS NOT NULL
  AND v.selfie_file_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM learning.consent_facts f
    WHERE f.tenant_id = v.tenant_id AND f.learner_id = v.learner_id AND f.kind = 'photo'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_consent_configure', 'consent.configure', 'Edit tenant consent texts (personal data, photo)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND p.code = 'consent.configure'
  -- Текст согласия — юридический документ центра, как и соглашение ПЭП (0067):
  -- правит администрация, не методист и тем более не слушатель.
  AND r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
