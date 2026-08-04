-- Фаза 4 Task 6 (ФТ-D5.1): биллинг аренды — «счёт + акт».
--
--   * core.rental_invoices — счёт платформы арендатору за период аренды.
--   * core.plans.grace_working_days — сколько РАБОЧИХ дней после срока оплаты
--     кабинет ещё живёт (решение владельца: 10, настраивается).
--
-- **Требование D5.3 соблюдено:** это НЕ модуль `payments` (заказы слушателей на
-- обучение). Аренда живёт на платформенном уровне отдельными сущностями: у неё
-- другой плательщик (учебный центр, не слушатель), другой получатель (владелец
-- платформы, не центр) и другие последствия неоплаты (приостановка кабинета).
--
-- Grace хранится в ТАРИФЕ, а не в настройках тенанта: `org.tenant_settings` правит
-- сам арендатор через PUT /tenant/settings — он продлил бы себе отсрочку сам.
-- Тариф меняет только платформа (platform.tenants.write).
--
-- Additive + idempotent.

BEGIN;

ALTER TABLE core.plans
  ADD COLUMN IF NOT EXISTS grace_working_days integer NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS core.rental_invoices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  -- Тариф на момент выставления; тариф могут сменить, счёт остаётся историей.
  plan_id text NULL REFERENCES core.plans(id),
  number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Копейки целым числом: деньги дробным типом не хранят.
  amount_kopecks bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  status text NOT NULL DEFAULT 'issued',
  -- Срок оплаты; отсчёт grace идёт от него, а не от даты выставления.
  due_at date NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  -- Какой адаптер шва выставлял (manual — «счёт+акт», noop — спящий).
  provider_code text NOT NULL DEFAULT 'manual',
  provider_invoice_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_invoices_status_chk CHECK (status IN ('issued', 'paid', 'cancelled')),
  CONSTRAINT rental_invoices_amount_chk CHECK (amount_kopecks >= 0),
  CONSTRAINT rental_invoices_period_chk CHECK (period_end >= period_start)
);

-- Номер счёта уникален на платформе: два счёта с одним номером — спор с бухгалтерией.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_invoices_number ON core.rental_invoices (number);

-- Индекс под ежедневный обход просрочки и под список счетов арендатора.
CREATE INDEX IF NOT EXISTS idx_rental_invoices_tenant_status
  ON core.rental_invoices (tenant_id, status, due_at);

COMMIT;
