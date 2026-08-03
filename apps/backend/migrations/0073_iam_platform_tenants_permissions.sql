-- Фаза 4 Task 3 (ФТ-D2.2): права платформенной админки тенантов.
--
-- `platform.tenants.*` — единственные права, открывающие КРОСС-ТЕНАНТНЫЙ список
-- арендаторов, их создание и смену статуса. Выдаются ТОЛЬКО роли platform_admin.
-- tenant_admin арендатора их не получает: сид 0010 когда-то раздал tenant_admin все
-- права скопом, и повторить это здесь означало бы дать каждому арендатору админку
-- всех остальных.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_platform_tenants_read', 'platform.tenants.read', 'List all platform tenants (cross-tenant, platform admin only)'),
  ('p_platform_tenants_write', 'platform.tenants.write', 'Create platform tenants and change their lifecycle status')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN ('platform.tenants.read', 'platform.tenants.write')
WHERE r.code = 'platform_admin'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
