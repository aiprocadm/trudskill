-- ФТ-D1 «изоляция до конца»: каталог провайдеров интеграций — платформенный ресурс.
--
-- Что чинится. Каталог провайдеров (ФИС ФРДО, ЕИСОТ, почта, вебинары, прокторинг) один
-- на всю платформу: у записи провайдера нет привязки к учебному центру, привязка живёт
-- отдельно — в учётных данных центра. При этом изменяющие ручки каталога требовали право
-- `integrations.write`, а оно есть у роли `tenant_admin`. То есть администратор ОДНОГО
-- центра мог переименовать или ВЫКЛЮЧИТЬ провайдера, общего для всех: выключил «ФИС ФРДО» —
-- и выгрузки в надзор встали у всех арендаторов сразу.
--
-- Данные при этом не утекали, поэтому дефект и не всплывал: изоляция здесь ломается не
-- чтением чужого, а записью в общее.
--
-- Решение: чтение каталога остаётся у арендатора (иначе он не выберет, к чему
-- подключаться), запись переезжает на новое платформенное право.
--
-- Аддитивно: существующее `integrations.write` НЕ удаляется — оно продолжает управлять
-- учётными данными самого центра, а это законное право арендатора.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_platform_integrations_write', 'platform.integrations.write', 'Manage the platform-wide integration provider catalog (shared by all tenants)')
ON CONFLICT (id) DO NOTHING;

-- Выдаётся ТОЛЬКО платформенной роли. Роли арендатора право не выдаётся сознательно —
-- в этом весь смысл правки.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'platform.integrations.write'
WHERE r.code = 'platform_admin'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
