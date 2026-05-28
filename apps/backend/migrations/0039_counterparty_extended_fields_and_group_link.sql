-- Phase 2 Plan C: расширение Counterparty + связь group ↔ counterparty.
-- Дата: 2026-05-30. Назначение: дать админке центра управлять компаниями-клиентами
-- с полным набором B2B-полей (ИНН/КПП/контакты/адрес/заметка), и связывать
-- учебные группы с конкретной компанией для агрегации прогресса.
--
-- DEVIATION vs plan: план называл схему mvp.counterparties, но реальная таблица
-- живёт в crm.counterparties (см. 0002_mvp_domain_model.sql:7). FK здесь
-- композитный (tenant_id, counterparty_id) → crm.counterparties (tenant_id, id)
-- по pattern'у миграции 0003. Без ON DELETE SET NULL: для composite FK
-- SET NULL обнулило бы и tenant_id, что сломало бы multitenancy.
-- Удаление counterparty в Plan C не предусмотрено (только status-toggle),
-- поэтому ON DELETE NO ACTION по умолчанию безопасен.

BEGIN;

-- 1. Расширенные поля компании. Все nullable: существующие записи остаются валидными.
ALTER TABLE crm.counterparties
  ADD COLUMN IF NOT EXISTS inn TEXT NULL,
  ADD COLUMN IF NOT EXISTS kpp TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS legal_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS note TEXT NULL;

-- CHECK на формат ИНН (10 или 12 цифр) — мягкая проверка; полная валидация
-- (контрольный разряд по алгоритму ФНС) — в DTO Task 3 / V1.1 при необходимости.
ALTER TABLE crm.counterparties
  DROP CONSTRAINT IF EXISTS counterparties_inn_format_check,
  ADD CONSTRAINT counterparties_inn_format_check
    CHECK (inn IS NULL OR inn ~ '^[0-9]{10}$' OR inn ~ '^[0-9]{12}$');

-- 2. Связь группа ↔ компания. Nullable: существующие группы остаются без компании.
ALTER TABLE learning.groups
  ADD COLUMN IF NOT EXISTS counterparty_id TEXT NULL;

-- Composite FK гарантирует, что group и counterparty в одном tenant'е
-- (анти-IDOR на уровне БД), используя counterparties_tenant_id_id_uniq из 0003.
ALTER TABLE learning.groups
  DROP CONSTRAINT IF EXISTS groups_counterparty_tenant_fk,
  ADD CONSTRAINT groups_counterparty_tenant_fk
    FOREIGN KEY (tenant_id, counterparty_id) REFERENCES crm.counterparties (tenant_id, id);

-- Partial index ускоряет агрегацию прогресса по клиенту (Task 6 GET endpoint).
CREATE INDEX IF NOT EXISTS groups_counterparty_id_idx
  ON learning.groups (tenant_id, counterparty_id)
  WHERE counterparty_id IS NOT NULL;

COMMIT;
