-- Журнал 342/343 (§5.418): рабочий стол сотрудника — под своим правом.
--
-- Что чинится. Сводка оперативной панели (`GET /workspace/summary`), входящие задачи
-- (`GET /tasks/inbox`) и блокеры (`GET /blockers`) стояли под `tenant.read`, и экран
-- `/workspace` — тоже. `tenant.read` есть у КАЖДОЙ роли, включая `learner`: это право видеть
-- карточку своего центра. Под ним же слушатель видел в меню «Оперативную панель» и читал
-- черновики курсов, задачи по документам и сбои выдачи всего центра.
--
-- Почему новое право, а не существующее. Рабочий стол — для всех, кто работает в центре:
-- администрации, менеджера, методиста, преподавателя. Ни одно из выданных прав не совпадает
-- с этим набором: единственное, что есть у всех сотрудников и нет у слушателя, —
-- `assessment.reviews.review`, и оно про проверку работ, а не про рабочий стол. Право
-- называет то, что охраняет.
--
-- Кому раздаём — всем ролям центра, кроме `learner` и `counterparty_rep` (представитель
-- заказчика видит только свой портал).
--
-- Новые арендаторы получают права копией с шаблонного (platform-tenants.service),
-- поэтому выдача здесь — по всем существующим ролям с такими кодами.
--
-- Additive + idempotent.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_workspace_read', 'workspace.read', 'Staff workspace: summary, task inbox and blockers of the tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'workspace.read'
WHERE r.code IN ('platform_admin', 'tenant_admin', 'manager', 'methodist', 'teacher')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
