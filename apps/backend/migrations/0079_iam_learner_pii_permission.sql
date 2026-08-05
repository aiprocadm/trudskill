-- Фаза 4 Task 12 (ФТ-G6): права субъекта персональных данных (152-ФЗ).
--
-- Отдельное право `learners.pii.manage` на две операции:
--   * выгрузка всех персональных данных слушателя (ст. 14 — право на доступ);
--   * обезличивание по отзыву согласия (ст. 9, ч. 2 / ст. 21).
--
-- Почему НЕ входит в `learners.write`: заводить и править карточки слушателей —
-- ежедневная работа методиста, а выгрузка досье целиком и стирание ПДн — операции
-- другого веса. Право выдаётся только администрации центра.
--
-- Additive + idempotent.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_learners_pii_manage', 'learners.pii.manage', 'Export and erase learner personal data (152-FZ subject rights)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'learners.pii.manage'
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
