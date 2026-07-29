-- 0067_learning_simple_signature.sql
-- Фаза 3 «Идентификация», Task 3 (ФТ-C1.1) — ПЭП: соглашение об электронном
-- взаимодействии и факт его принятия.
--
-- Зачем: уровень 1 политики (`0066`) означает, что клики «Ознакомлен», ответы на тесты
-- и заявления считаются подписанными простой электронной подписью. Чтобы это имело
-- юридический смысл, нужно доказать: слушатель принял КОНКРЕТНЫЙ текст соглашения,
-- в конкретный момент, с конкретного устройства.
--
-- Почему храним ХЭШ ТЕКСТА, а не только ссылку на соглашение: текст редактируется
-- тенантом, и через год он будет другим. Ссылка на «соглашение тенанта» доказывает
-- ничего — хэш доказывает, что подписан был именно тот текст.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.esignature_agreements (
  tenant_id text NOT NULL,
  -- Версия растёт при КАЖДОМ изменении текста: принятая версия должна оставаться
  -- доказуемой, поэтому старые строки не переписываются.
  version integer NOT NULL,
  body text NOT NULL,
  -- SHA-256 нормализованного текста; вычисляется приложением.
  body_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esignature_agreements_pk PRIMARY KEY (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS learning.esignature_acceptances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  -- Принимает пользователь (у слушателя есть учётная запись); связь со слушателем
  -- восстанавливается через iam-линк, дублировать её здесь незачем.
  user_id text NOT NULL,
  agreement_version integer NOT NULL,
  -- Хэш ИМЕННО ТОГО текста, который человек видел на экране.
  body_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text NULL,
  user_agent text NULL,
  -- Повторное принятие той же версии тем же пользователем — не новое доказательство,
  -- а дубль: уникальность делает операцию идемпотентной.
  CONSTRAINT esignature_acceptances_unique UNIQUE (tenant_id, user_id, agreement_version)
);

-- «Принял ли этот пользователь действующую версию» — запрос на каждом ПЭП-действии.
CREATE INDEX IF NOT EXISTS idx_esignature_acceptances_user
  ON learning.esignature_acceptances (tenant_id, user_id);

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_esignature_configure', 'esignature.configure', 'Edit the tenant e-signature agreement')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND p.code = 'esignature.configure'
  -- Текст соглашения — юридический документ центра, а не учебный материал:
  -- править его может администрация, но не методист и тем более не слушатель.
  AND r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
