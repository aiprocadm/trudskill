-- ТЗ перехода с CDOPROF §5/§12, МГ-G1.1/G3.3 (Фаза 5, срез 24.1): право смотреть календарь центра.
--
-- По РМ21 право заводится одной миграцией с ручкой, которая его проверяет
-- (`calendar/calendar.controller.ts`, `GET /calendar/events`). Кому — по матрице ТЗ §12
-- «Календарь: события» (РМ138): администрация центра и платформы, руководитель, куратор,
-- преподаватель. Методисту — нет: в матрице его нет. Что именно человек увидит в календаре,
-- решают права источников (`groups.read`, `enrollments.read`, `tasks.read`), а не это право.
--
-- Только добавление: ON CONFLICT DO NOTHING, существующие строки не трогаются.

INSERT INTO iam.permissions (id, code, description)
VALUES ('p_calendar_read', 'calendar.read', 'Calendar: view events of groups, deadlines and tasks')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'calendar.read'
WHERE r.code IN ('platform_admin', 'tenant_admin', 'manager', 'curator', 'teacher')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
