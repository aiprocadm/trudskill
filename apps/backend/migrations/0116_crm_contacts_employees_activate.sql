-- МГ-D2.1 (ТЗ перехода с CDOPROF, Фаза 2, срез 14.1): оживление контактов и сотрудников компании.
--
-- Таблицы `crm.counterparty_contacts` и `crm.counterparty_employees` созданы в 0002 и с тех пор
-- мёртвые: их не читает и не пишет ни один код. Здесь — то, чего им не хватает для работы:
--   • контакт: учётная запись представителя в портале (`user_id`, ставит приглашение, срез
--     14.3), статус «в архиве», внешние идентификаторы переноса;
--   • сотрудник: слушатель, которым он стал при зачислении (`learner_id`; без внешнего ключа —
--     слушатели проецируются из снимка без гарантии строки, РМ118), один слушатель — один
--     сотрудник;
--   • табельный номер уникален у компании ТОЛЬКО когда задан (РМ117): прежнее
--     `UNIQUE NULLS NOT DISTINCT` не давало завести второго сотрудника без номера.
-- Всё аддитивно: колонки с умолчаниями, индексы; ограничение номера ослабляется, не ужесточается.

ALTER TABLE crm.counterparty_contacts
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_system text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparty_contacts_status_chk'
  ) THEN
    ALTER TABLE crm.counterparty_contacts
      ADD CONSTRAINT counterparty_contacts_status_chk CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS counterparty_contacts_tenant_counterparty_idx
  ON crm.counterparty_contacts (tenant_id, counterparty_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS counterparty_contacts_tenant_user_idx
  ON crm.counterparty_contacts (tenant_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS counterparty_contacts_tenant_external_uniq
  ON crm.counterparty_contacts (tenant_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE crm.counterparty_employees
  ADD COLUMN IF NOT EXISTS learner_id text;

CREATE UNIQUE INDEX IF NOT EXISTS counterparty_employees_tenant_learner_uniq
  ON crm.counterparty_employees (tenant_id, learner_id)
  WHERE learner_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE crm.counterparty_employees
  DROP CONSTRAINT IF EXISTS counterparty_employees_tenant_counterparty_empno_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS counterparty_employees_tenant_counterparty_empno_uniq
  ON crm.counterparty_employees (tenant_id, counterparty_id, employee_no)
  WHERE employee_no IS NOT NULL AND deleted_at IS NULL;
