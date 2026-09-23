-- 0103_iam_tasks_permissions.sql
--
-- ТЗ «Переход с CDOPROF», МГ-J1.2 (часть) и МГ-G2: права модуля задач — вместе с ручками,
-- которые их проверяют (решение РМ21: право без ручки в базе не живёт).
--
-- ЗАЧЕМ. Задачи сотрудников — замена «календаря задач» CDOPROF (§0 п. 2): без них куратор не
-- уйдёт из старой системы. Три права:
--   • `tasks.read`  — видеть свои задачи (назначенные мне и поставленные мной), их комментарии;
--   • `tasks.write` — ставить задачи, работать с ними (взять / выполнить / подтвердить /
--                     вернуть / отменить / перенести), комментировать;
--   • `tasks.manage_all` — видеть и править задачи ВСЕХ сотрудников центра (`filter=all`,
--                     перенос и правка чужих задач). Проверяется в сервисе, не декоратором:
--                     та же ручка отдаёт свои задачи без права и все — с ним.
--
-- КОМУ (§3, матрица §12 — строка «Задачи»; решение РМ25):
--   • `read` + `write` — всем сотрудникам: администраторам, руководителю, куратору,
--     методисту, преподавателю. Преподавателю тоже `write`: ТЗ §3 даёт ему «tasks.read
--     (свои)», но исполнитель без `write` не смог бы взять задачу в работу и выполнить —
--     переходы стоят под `write`, а «своё / чужое» решает сервис;
--   • `manage_all` — администраторы и руководитель («П (все)» в матрице §12).
-- Слушатель и представитель заказчика задач не видят.

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_tasks_read', 'tasks.read', 'Tasks: view own (assigned to me / created by me) tasks and comments'),
  ('p_tasks_write', 'tasks.write', 'Tasks: create tasks, act on assigned tasks, comment'),
  ('p_tasks_manage_all', 'tasks.manage_all', 'Tasks: view and manage all tasks of the tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN ('tasks.read', 'tasks.write')
WHERE r.code IN ('platform_admin', 'tenant_admin', 'manager', 'methodist', 'teacher', 'curator')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'tasks.manage_all'
WHERE r.code IN ('platform_admin', 'tenant_admin', 'manager')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
