-- Фаза 4 Task 2 (ФТ-D2.1): жизненный цикл тенанта — trial | active | suspended | archived.
--
-- До сих пор `core.tenants.status` был свободным текстом: опечатка в статусе не ловилась
-- нигде, а сервисы сравнивали строку буквально — тенант с мусорным статусом просто
-- выпадал из всех выборок молча. Для аренды статус становится несущим (suspended после
-- неоплаты, archived после офбординга), поэтому множество значений фиксируется на уровне БД.

BEGIN;

-- Мусорный статус приводим к suspended, а НЕ к active: неизвестное состояние не должно
-- держать тенанта работающим. Ошибочно приостановленного вернёт админ платформы одним
-- действием; ошибочно активированный — это чужие данные, доступные без оплаты и договора.
UPDATE core.tenants
SET status = 'suspended', updated_at = now()
WHERE status NOT IN ('trial', 'active', 'suspended', 'archived');

ALTER TABLE core.tenants
  DROP CONSTRAINT IF EXISTS core_tenants_status_check;
ALTER TABLE core.tenants
  ADD CONSTRAINT core_tenants_status_check
  CHECK (status IN ('trial', 'active', 'suspended', 'archived'));

COMMENT ON COLUMN core.tenants.status IS
  'ФТ-D2.1: trial | active | suspended | archived. Suspended/archived не проходят TenantGuard-выборки и ночные сканы.';

COMMIT;
