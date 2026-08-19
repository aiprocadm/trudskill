-- ФТ-D1 / ФТ-G1: правка карточки учебного центра требует права.
--
-- Что чинится. Ручки `PUT /tenant/settings` и `PUT /tenant/requisites` стояли только под
-- проверкой арендатора, без единого права. Экран «Реквизиты» при этом открыт по праву
-- `tenant.read`, а оно есть у ВСЕХ ролей, включая `learner`. То есть слушатель мог изменить
-- юридическое название центра, ИНН и ссылки на подпись руководителя с печатью.
--
-- Почему это важнее, чем кажется. Реквизиты — не справочная карточка: из них берутся данные
-- и картинки для ВЫДАВАЕМЫХ ДОКУМЕНТОВ (удостоверения, протоколы). Подмена реквизитов — это
-- подмена того, что напечатано в документе об обучении.
--
-- Рядом, в том же контроллере, `PUT /tenant/branding` уже закрыт правом
-- `tenant.branding.configure` (0075) — то есть про права здесь знали, а на настройки и
-- реквизиты их просто не поставили.
--
-- Право одно на обе ручки: и то и другое — «правка карточки центра», операция администрации.
-- Выдаётся тем же ролям, что и брендирование.
--
-- Additive + idempotent.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_tenant_settings_write', 'tenant.settings.write', 'Edit tenant profile: settings and legal requisites (used in issued documents)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'tenant.settings.write'
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
