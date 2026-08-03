-- Фаза 4 Task 4 (ФТ-D3.1): право настройки бренда учебного центра.
--
-- Отдельное право семейства *.configure (как video.configure / sms.configure):
-- логотип и цвета — витрина центра, их правит администрация, а не методист.
-- Читают бренд ВСЕ авторизованные пользователи тенанта (тема красится каждому),
-- поэтому отдельного права на чтение нет.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_tenant_branding_configure', 'tenant.branding.configure', 'Configure tenant branding (logo, colors, display name)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'tenant.branding.configure'
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
