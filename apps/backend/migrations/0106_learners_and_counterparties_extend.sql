-- 0106_learners_and_counterparties_extend.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0 (МГ-A1.1: «learners → learning.learners, ПДн
-- шифруются в колонках как в 0061»; §17 «learners» и «counterparties»).
--
-- ЗАЧЕМ. В снимке персональные данные слушателя лежат шифртекстом (`enc:` + AES-256-GCM,
-- `pii-crypto.ts`) и рядом — слепой индекс СНИЛС `snilsHash` (HMAC), по которому ищет
-- `findLearnersBySnils`; миграция 0061 индексирует его прямо в JSON. В таблице для этого нужны
-- отдельные колонки: открытые `snils`, `email`, `phone`, `birth_date`/`date_of_birth` (0002/0036/0046)
-- шифртекст не примут (тип `date`) и не должны — ПДн в открытом виде не пишутся.
--
-- ЧТО ДЕЛАЕМ (только добавление, все колонки необязательные):
--   • learners: `*_enc` — шифртекст, `snils_hash`/`passport_hash` — слепые индексы; поля CDOPROF §17
--     (пол, гражданство, образование, адрес, диплом, доставка, согласие, логин, должность);
--     индекс (tenant, snils_hash) — замена индекса 0061 для таблицы; открытые `snils` и
--     `date_of_birth` объявляются устаревшими комментарием (ТЗ §17: «использовать birth_date»);
--   • counterparties: реквизиты организации §17 (ОГРН, ОКПО/ОКАТО/ОКТМО/ОКОГУ/ОКОПФ/ОКВЭД,
--     адреса, руководитель, менеджер центра, договор, брендинг) и индексы по ИНН и менеджеру.
-- Уникальность ИНН в пределах центра НЕ ставится: в CDOPROF у одного юрлица бывает несколько
-- карточек (филиалы с одним ИНН и разным КПП) — дубли разбирает импорт (МГ-K3.1), не БД.

-- 1. Слушатели: шифртекст и слепые индексы.
ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS snils_enc text,
  ADD COLUMN IF NOT EXISTS snils_hash text,
  ADD COLUMN IF NOT EXISTS email_enc text,
  ADD COLUMN IF NOT EXISTS phone_enc text,
  ADD COLUMN IF NOT EXISTS birth_date_enc text,
  ADD COLUMN IF NOT EXISTS passport_enc text,
  ADD COLUMN IF NOT EXISTS passport_hash text;

-- 2. Слушатели: поля §17 и связь с подразделением (Learner.organizationUnitId).
ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS organization_unit_id text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS citizenship text,
  ADD COLUMN IF NOT EXISTS registration_address text,
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS diploma jsonb,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS extra_fields jsonb,
  ADD COLUMN IF NOT EXISTS consent_status text,
  ADD COLUMN IF NOT EXISTS photo_file_id text,
  ADD COLUMN IF NOT EXISTS login text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS position_id text;

CREATE INDEX IF NOT EXISTS learners_tenant_snils_hash_idx ON learning.learners (tenant_id, snils_hash) WHERE snils_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS learners_tenant_counterparty_idx ON learning.learners (tenant_id, counterparty_id)
  WHERE counterparty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learners_tenant_status_idx ON learning.learners (tenant_id, status);

COMMENT ON COLUMN learning.learners.snils IS
  'deprecated: открытый СНИЛС не пишется; шифртекст — snils_enc, поиск — snils_hash (Фаза 1, 0106)';
COMMENT ON COLUMN learning.learners.date_of_birth IS
  'deprecated: дубль birth_date (0046); открытая дата не пишется, шифртекст — birth_date_enc (Фаза 1, 0106)';

-- 3. Контрагенты: реквизиты §17.
ALTER TABLE crm.counterparties
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS ogrn text,
  ADD COLUMN IF NOT EXISTS okpo text,
  ADD COLUMN IF NOT EXISTS okato text,
  ADD COLUMN IF NOT EXISTS oktmo text,
  ADD COLUMN IF NOT EXISTS okogu text,
  ADD COLUMN IF NOT EXISTS okopf text,
  ADD COLUMN IF NOT EXISTS okved text,
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS actual_address text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS director_name text,
  ADD COLUMN IF NOT EXISTS director_position text,
  ADD COLUMN IF NOT EXISTS manager_user_id text,
  ADD COLUMN IF NOT EXISTS contract_date date,
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS branding jsonb;

CREATE INDEX IF NOT EXISTS counterparties_tenant_inn_idx ON crm.counterparties (tenant_id, inn) WHERE inn IS NOT NULL;
CREATE INDEX IF NOT EXISTS counterparties_tenant_manager_idx ON crm.counterparties (tenant_id, manager_user_id)
  WHERE manager_user_id IS NOT NULL;
