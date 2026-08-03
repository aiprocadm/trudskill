-- Фаза 4 Task 3, срез 2 (ФТ-D2.2): право входа «от имени».
--
-- Отдельное от `platform.tenants.*`: видеть список арендаторов и входить в их кабинеты —
-- разные полномочия. Выдаётся ТОЛЬКО platform_admin. Вход без записи в аудите невозможен
-- по построению (запись идёт до выдачи сессии) — именно она отличает поддержку от
-- злоупотребления.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_platform_impersonate', 'platform.impersonate', 'Impersonate a tenant user for support (audited before session issue)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'platform.impersonate'
WHERE r.code = 'platform_admin'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
