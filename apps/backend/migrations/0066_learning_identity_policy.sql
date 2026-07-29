-- 0066_learning_identity_policy.sql
-- Фаза 3 «Идентификация», Task 1 (ФТ-C1) — политика идентификации как ДАННЫЕ.
--
-- Что было: три гейта перед итоговым тестом (одноразовый код `0044`, селфи+паспорт `0050`,
-- прокторинг `0051`) уже стоят в правильной точке, но включаются флагами на связке
-- группа-курс. Учебный центр не может сказать «у нас везде уровень 2» — приходится
-- проставлять галочки на каждой группе, и любая забытая группа = дыра в требовании.
--
-- Что здесь: уровень идентификации хранится записью с ОБЛАСТЬЮ ДЕЙСТВИЯ — тенант,
-- направление или конкретный курс. Гейты (Task 2) будут читать вычисленный уровень.
-- Флаги на группе-курсе НЕ удаляются: они остаются ужесточением, иначе включение
-- политики ослабило бы уже настроенные идущие группы.
--
--   Уровень 0 — логин и пароль (всегда включён, выключить нельзя).
--   Уровень 1 — ПЭП: соглашение об электронном взаимодействии.
--   Уровень 2 — подтверждение личности документом (селфи + паспорт).
--   Уровень 3 — экзаменационный контроль: одноразовый код и/или прокторинг.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.identity_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  -- Область действия: политика тенанта, направления или конкретного курса.
  scope text NOT NULL,
  -- NULL только у scope='tenant': у тенантской политики нет «своего» объекта.
  scope_id text NULL,
  level integer NOT NULL DEFAULT 0,
  -- Разовая проверка фото непосредственно перед экзаменом (ТЗ §5, уровень 2).
  require_photo_before_exam boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_policies_scope_chk CHECK (scope IN ('tenant', 'direction', 'course')),
  -- Уровень 0 — нижняя граница: политики «ничего не требуется» не существует.
  CONSTRAINT identity_policies_level_chk CHECK (level BETWEEN 0 AND 3),
  -- У тенантской политики scope_id обязан быть пустым, у остальных — заполнен:
  -- запись «политика направления без направления» ни к чему не применима.
  CONSTRAINT identity_policies_scope_id_chk CHECK (
    (scope = 'tenant' AND scope_id IS NULL) OR (scope <> 'tenant' AND scope_id IS NOT NULL)
  )
);

-- Одна политика на область. Без этого два конфликтующих уровня на один курс
-- разрешались бы «как повезёт» — а это решение про допуск к экзамену.
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_policies_scope
  ON learning.identity_policies (tenant_id, scope, coalesce(scope_id, ''));

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_identity_configure', 'identity.configure', 'Configure the tenant identity policy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND p.code = 'identity.configure'
  -- Настройка уровня идентификации — решение администрации центра, не методиста:
  -- ослабление политики означает допуск к экзамену без подтверждения личности.
  AND r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
