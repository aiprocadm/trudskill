-- Заводит роль `teacher` (преподаватель) — её не существовало ни в одной базе.
--
-- Расхождение из журнала (запись 21): чертёж короткого меню, набор частых задач и
-- маршрут «Очередь на проверку» для преподавателя в коде есть, ТЗ §4.4 роль называет,
-- e2e-тесты её используют — но `iam.roles` её не содержит. Роль выглядела работающей и
-- при этом была недостижима: выдать её человеку было нечем.
--
-- Решение принято агентом по поручению владельца «реши сам, как эффективнее»: роль
-- заводится. Обойтись методистом нельзя — это разная работа. Методист собирает
-- программу курса; преподаватель проверяет работы конкретных слушателей и видит их
-- персональные данные. Слить их в одну роль значит выдать методисту доступ к личным
-- делам, который ему не нужен, — а это ровно то, от чего защищает разделение ролей.
--
-- Набор прав выведен из меню роли (`role-blueprints.ts`): «Группы», «Очередь на
-- проверку», «Календарь окончаний», «Курсы», «Сообщения» — плюс права, без которых
-- эти экраны показывают пустоту. Ничего сверх того: право на изменение курсов,
-- зачислений и учётных записей преподавателю не даётся.

INSERT INTO iam.roles (id, tenant_id, code, name)
SELECT concat('r_teacher_', t.id), t.id, 'teacher', 'Преподаватель'
FROM core.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN (
  -- вход в кабинет и общие разделы
  'tenant.read',
  -- «Курсы» и материалы: преподаватель ведёт занятия по программе, но не правит её
  'courses.read',
  'materials.read',
  -- «Группы» и состав: кого он учит
  'groups.read',
  'learners.read',
  'enrollments.read',
  -- «Календарь окончаний» и прогресс группы
  'progress.read',
  -- «Очередь на проверку» — основная работа роли
  'assessment.reviews.review',
  'assessment.assignments.read',
  'assessment.submissions.submit',
  'assessment.attempts.read',
  'assessment.results.read',
  'assessment.tests.read'
)
WHERE r.code = 'teacher'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
