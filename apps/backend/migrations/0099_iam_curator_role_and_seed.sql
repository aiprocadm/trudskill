-- 0099_iam_curator_role_and_seed.sql
--
-- ТЗ «Переход с CDOPROF», МГ-J1.1: роль `curator` («Куратор обучения») — в каждом центре.
--
-- ЗАЧЕМ. В CDOPROF ежедневную работу ведёт менеджер-куратор: заводит группы, зачисляет
-- слушателей, следит за экзаменами и документами, ведёт контрагентов. В TrudSkill такой роли
-- не было: методист собирает программы, преподаватель проверяет работы, руководитель видит
-- всё. Куратору пришлось бы выдавать роль руководителя — вместе с настройками центра,
-- шаблонами и правами, которые ему не нужны и опасны в чужих руках.
--
-- ЧТО ДЕЛАЕМ (только добавление, поведение не меняется — пользователей с этой ролью нет):
--   • роль в каждом центре по образцу 0084 (роли заведены по центрам);
--   • набор прав — по ТЗ §3 и матрице §12, ТОЛЬКО из уже существующих кодов. Новые коды
--     (`tasks.*`, `calendar.read`, `reports.*`, `learners.credentials`) заводятся вместе с
--     ручками, которые их проверяют (позиции 5 и 10): сторож `permission-coverage` не даёт
--     держать в базе право, которое никто не проверяет (решение РМ21).
--
-- Чего у куратора НЕТ намеренно (§3): шаблоны, нумерация, права, госреестры на запись,
-- обезличивание ПДн. «Свои группы» (scope=own) — P1 (§12, МГ-J3.1), в MVP куратор видит все.
--
-- Новый центр получает роль копированием из центра администратора
-- (platform-tenants.service.ts), поэтому провижининг дорабатывать не нужно.

INSERT INTO iam.roles (id, tenant_id, code, name)
SELECT concat('r_curator_', t.id), t.id, 'curator', 'Куратор обучения'
FROM core.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN (
  -- вход в кабинет и общие разделы
  'tenant.read',
  'workspace.read',
  -- контрагенты: заказчики, с которыми куратор работает каждый день (§3: read/write)
  'counterparties.read',
  'counterparties.write',
  -- слушатели: личное дело, зачисление, доступы (§3: read/write)
  'learners.read',
  'learners.write',
  -- группы: создание, состав, даты, закрытие (§3: read/write)
  'groups.read',
  'groups.write',
  -- зачисления и их статусы (§3: read/write/change_status)
  'enrollments.read',
  'enrollments.write',
  'enrollments.change_status',
  -- документы: видеть и формировать пакет группы; шаблоны и нумерация — нет (§3)
  'documents.read',
  'documents.generate',
  -- госвыгрузки: смотреть и выгружать; писать в реестры — нет (§3: regulatory.export.read)
  'regulatory.export.read',
  -- курсы и направления: выбрать программу для группы (матрица §12 — П)
  'courses.read',
  'directions.read'
)
WHERE r.code = 'curator'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
