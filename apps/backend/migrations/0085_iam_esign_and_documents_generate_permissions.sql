-- Ревизия 2026-08-26: девять прав требовались кодом, но не существовали ни в одной базе.
--
-- Что чинится. Сверка «права, которые требует код» против «права, которые заводят миграции»
-- дала девять сирот: весь раздел электронной подписи (`esign.*`, 8 прав) и ручной выпуск
-- документа (`documents.generate`). Таблицы под них есть (миграция 0004), контроллеры их
-- требуют, экраны `/esign/*` их спрашивают у меню — а самих прав в `iam.permissions` нет.
--
-- Чем это оборачивалось. `PermissionGuard` резолвит права строго через
-- `iam.user_roles → iam.role_permissions → iam.permissions`. Права, которого нет в таблице,
-- не может быть ни у кого — включая администратора центра и платформенного администратора.
-- То есть раздел электронной подписи был не «недоделан», а ЗАПЕРТ: ручки отвечали отказом,
-- пункты меню не показывались никому, а с ними — заявки на подпись, процессы подписания и
-- юридический журнал. Тем же способом был заперт `POST /documents/generate` и его собрат
-- `POST /admin/documents/close-group` — «закрыть группу», то есть выпуск протокола и
-- удостоверений по итогам обучения.
--
-- Сверено с живой базой, а не с текстом: `select code from iam.permissions where code in (...)`
-- вернул пусто по всем девяти.
--
-- Кому раздаём — по образцу соседей, а не по названию роли:
--   * `documents.generate` — тем же, у кого уже есть `documents.write` и `documents.sign`
--     (`tenant_admin`, `methodist`, `platform_admin`): выпуск документа — работа того, кто
--     ведёт программу и отвечает за бланки.
--   * чтение заявок и процессов — плюс `manager`: он ведёт клиента и должен видеть, на какой
--     стадии подписание, но менять ничего не может.
--   * проверка заявки (`review`) — только `tenant_admin` и `platform_admin`: это сверка
--     документов, удостоверяющих личность, и она не размазывается по ролям.
--   * подписание (`participants.sign`) — включая `learner`: подписывает тот, кого назначили
--     участником, и чаще всего это как раз слушатель. Без этого права контур подписания
--     остаётся мёртвым даже после того, как он снова стал виден.
--   * юридический журнал (`legal.read`) — `tenant_admin` и `platform_admin`: его читают,
--     когда разбирают спор, и он показывает, кто что подписал.
--
-- Роль `counterparty_rep` (представитель компании-заказчика) не получает ничего: подписание
-- ведёт учебный центр.
--
-- Additive + idempotent.

BEGIN;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_documents_generate', 'documents.generate', 'Issue documents: single, batch and group close-out'),
  ('p_esign_applications_read', 'esign.applications.read', 'Read e-signature applications and their files'),
  ('p_esign_applications_write', 'esign.applications.write', 'Create and edit e-signature applications'),
  ('p_esign_applications_submit', 'esign.applications.submit', 'Submit an e-signature application for review'),
  ('p_esign_applications_review', 'esign.applications.review', 'Review, approve or reject e-signature applications'),
  ('p_esign_processes_read', 'esign.processes.read', 'Read signing processes and participants'),
  ('p_esign_processes_write', 'esign.processes.write', 'Create, start and cancel signing processes'),
  ('p_esign_participants_sign', 'esign.participants.sign', 'Sign as a participant of a signing process'),
  ('p_esign_legal_read', 'esign.legal.read', 'Read the legally significant signing log')
ON CONFLICT (id) DO NOTHING;

-- Выпуск документов: как у documents.write / documents.sign.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'documents.generate'
WHERE r.code IN ('platform_admin', 'tenant_admin', 'methodist')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Чтение заявок и процессов: администрация, методист и менеджер (менеджер — только смотрит).
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN ('esign.applications.read', 'esign.processes.read')
WHERE r.code IN ('platform_admin', 'tenant_admin', 'methodist', 'manager')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Ведение заявок и процессов: администрация и методист.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN (
  'esign.applications.write',
  'esign.applications.submit',
  'esign.processes.write'
)
WHERE r.code IN ('platform_admin', 'tenant_admin', 'methodist')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Проверка заявки и юридический журнал: только администрация.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN ('esign.applications.review', 'esign.legal.read')
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Подписание: тот, кого назначили участником, — включая слушателя.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'esign.participants.sign'
WHERE r.code IN ('platform_admin', 'tenant_admin', 'methodist', 'teacher', 'learner')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
