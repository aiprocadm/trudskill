-- Фаза 4 Task 1 (ФТ-E5): роль «представитель заказчика» и её привязка к контрагенту.
--
-- **Зачем это первым делом.** Портал заказчика (`/counterparty-portal`) сегодня тянет
-- ПОЛНЫЕ списки контрагентов, групп и зачислений тенанта — он изначально сделан как
-- обзор для персонала, что написано в его собственном заголовке. Сейчас это не утечка
-- только потому, что роли представителя не существует и внешний человек войти не может.
-- Заводить роль без скоупа означало бы включить утечку в тот же день.
--
-- Поэтому миграция даёт роли МИНИМУМ прав на чтение и одновременно вводит признак
-- привязки к контрагенту, на который опирается скоуп в сервисах. Без привязки
-- пользователь этой роли не увидит НИЧЕГО — это безопасное поведение по умолчанию:
-- забытая привязка приводит к пустому экрану, а не к чужим данным.

BEGIN;

-- Привязка пользователя к контрагенту. NULL у всего персонала центра — они не
-- представители и скоупу по контрагенту не подлежат.
ALTER TABLE iam.users
  ADD COLUMN IF NOT EXISTS counterparty_id text NULL;

COMMENT ON COLUMN iam.users.counterparty_id IS
  'ФТ-E5: контрагент представителя заказчика. NULL у персонала УЦ. Основание скоупа выборок портала.';

-- Композитный FK: контрагент обязан принадлежать ТОМУ ЖЕ тенанту. Без tenant_id в
-- ключе можно было бы привязать пользователя к контрагенту чужого центра — и скоуп
-- сам стал бы каналом утечки.
ALTER TABLE iam.users
  DROP CONSTRAINT IF EXISTS iam_users_counterparty_fk;
ALTER TABLE iam.users
  ADD CONSTRAINT iam_users_counterparty_fk
  FOREIGN KEY (tenant_id, counterparty_id)
  REFERENCES crm.counterparties (tenant_id, id)
  ON DELETE SET NULL;

-- Выборка «все представители этого контрагента» — нужна админу центра при выдаче доступа.
CREATE INDEX IF NOT EXISTS idx_iam_users_counterparty
  ON iam.users (tenant_id, counterparty_id)
  WHERE counterparty_id IS NOT NULL;

INSERT INTO iam.roles (id, tenant_id, code, name)
VALUES ('r_counterparty_rep', 'tenant_demo', 'counterparty_rep', 'Представитель заказчика')
ON CONFLICT (id) DO NOTHING;

-- Отдельное право портала вместо `counterparties.read`: последнее означает «видеть
-- справочник контрагентов центра», то есть ровно ту клиентскую базу, которую
-- представитель видеть не должен. Смешивать их нельзя.
INSERT INTO iam.permissions (id, code, description)
VALUES ('p_portal_read', 'portal.read', 'Read own counterparty portal (scoped to the representative company)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND (
    -- Представителю — только портал. Никаких `counterparties.read`, `groups.read`,
    -- `learners.read`: каждое из них отдаёт данные ПО ВСЕМУ центру.
    (p.code = 'portal.read' AND r.code = 'counterparty_rep')
    -- Персоналу портал тоже доступен: менеджер должен видеть то же, что и клиент,
    -- когда разбирает его обращение.
    OR (p.code = 'portal.read' AND r.code IN ('platform_admin', 'tenant_admin', 'manager'))
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
