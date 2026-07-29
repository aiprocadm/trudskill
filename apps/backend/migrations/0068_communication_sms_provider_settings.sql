-- Фаза 3 Task 5 (ФТ-C1.3 / ФТ-F2): per-tenant настройки СМС-провайдера.
--
-- Зеркало `learning.video_provider_settings` (0063) и `payments.payment_provider_settings`
-- (0056): СМС покупает и оплачивает сам учебный центр, поэтому провайдер выбирается ПЕР
-- ТЕНАНТ, а не одним глобальным env-переключателем.
--
-- Правило шва: здесь ТОЛЬКО несекретная конфигурация. API-ключи операторов живут в env /
-- секрет-хранилище и в эту таблицу не попадают никогда — иначе выгрузка БД станет
-- выгрузкой платёжных доступов к СМС-шлюзу.

BEGIN;

CREATE TABLE IF NOT EXISTS communication.sms_provider_settings (
  tenant_id text PRIMARY KEY,
  provider_code text NOT NULL DEFAULT 'noop',
  -- Имя отправителя, зарегистрированное тенантом у оператора («UC-PROF»). У российских
  -- операторов незарегистрированное имя = отказ на их стороне, поэтому оно настраиваемое.
  sender_name text NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE communication.sms_provider_settings IS
  'Фаза 3 Task 5: per-tenant СМС-провайдер. ТОЛЬКО несекретная конфигурация — ключи операторов живут в секрет-хранилище.';

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_sms_configure', 'sms.configure', 'Configure the tenant SMS provider')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND p.code = 'sms.configure'
  -- За СМС центр платит деньги: включать канал может только администрация.
  -- Методисту это право не нужно, а слушателю — тем более.
  AND r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
