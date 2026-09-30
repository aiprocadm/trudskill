-- ТЗ перехода с CDOPROF §12/§16, МГ-K3.1 (Фаза 4, срез 23.1): право запуска импорта из CDOPROF.
--
-- По РМ21 право заводится одной миграцией с ручками, которые его проверяют
-- (`import-cdoprof/import.controller.ts`), — иначе сторож permission-coverage видел бы право
-- без проверяющего. Выдаётся администрации центра и платформы: импорт переносит слушателей
-- и компании целиком, это решение уровня центра, а не методиста или куратора.
--
-- Только добавление: ON CONFLICT DO NOTHING, существующие строки не трогаются.

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_import_run', 'import.run', 'Import: run CDOPROF import (dry run and report)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'import.run'
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
