-- Фаза 4 Task 5 (ФТ-D4): тарифы и лимиты аренды.
--
--   * core.plans — тариф платформы: лимиты (null = безлимит) + функциональные флаги
--     (proctoring / scorm / api / webinars) в jsonb `features`.
--   * core.tenant_subscriptions — подписка арендатора на тариф; активная подписка
--     на тенанта одна (частичный unique по status='active').
--   * право tenant.usage.read — экран «Использование» у администрации центра.
--
-- Платформенный уровень (как platform.tenants.*): тарифы определяет владелец платформы,
-- назначение — под существующим platform.tenants.write (управление арендатором включает
-- его тариф; отдельное право не заводим намеренно). Требование D5.3 соблюдено: с
-- payments (заказы слушателей) эти сущности не пересекаются.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS core.plans (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  -- null = безлимит по статье; лимиты в штуках/байтах.
  active_learners_limit integer NULL,
  staff_limit integer NULL,
  storage_limit_bytes bigint NULL,
  -- {"proctoring": bool, "scorm": bool, "api": bool, "webinars": bool}; отсутствие ключа = выключено.
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.tenant_subscriptions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  plan_id text NOT NULL REFERENCES core.plans(id),
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_subscriptions_status_chk CHECK (status IN ('active', 'cancelled'))
);

-- Одна АКТИВНАЯ подписка на тенанта; отменённые копятся историей.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_active
  ON core.tenant_subscriptions (tenant_id)
  WHERE status = 'active';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_tenant_usage_read', 'tenant.usage.read', 'View tenant plan usage and limits')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'tenant.usage.read'
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
