-- 0109_normalized_search_trgm_indexes.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0 (МГ-A2.1: «q — через ILIKE/pg_trgm по ФИО, коду и
-- номеру, плюс слепой индекс СНИЛС»). Решение агента РМ33.
--
-- ЗАЧЕМ. Поиск подстроки `ILIKE '%…%'` без триграммного индекса — это полный проход таблицы;
-- на объёме CDOPROF (14 000 слушателей, 25 000 групп, 60 000 документов) он не уложится в
-- p95 ≤ 500 мс (МГ-A3.1).
--
-- РМ33. `CREATE EXTENSION` требует права владельца базы или суперпользователя; у роли стенда
-- или боевого контура его может не быть. Миграция обязана пройти в любом случае: расширение
-- ставится под перехватом ошибки (в журнал уходит NOTICE), а индексы создаются только если
-- расширение есть. Без расширения поиск работает медленнее, но работает — это лучше, чем
-- упавший деплой. Runbook для владельца: `CREATE EXTENSION pg_trgm;` от суперпользователя и
-- повторный запуск этой миграции (она повторяема) — либо ручное создание индексов ниже.
--
-- Слепой индекс СНИЛС — `learners_tenant_snils_hash_idx` в 0106; здесь — только текст.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm недоступен (%), триграммные индексы поиска не созданы — см. 0109', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS counterparties_name_trgm_idx ON crm.counterparties USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS learners_full_name_trgm_idx ON learning.learners USING gin (
      (last_name || ' ' || first_name || ' ' || coalesce(middle_name, '')) gin_trgm_ops
    );
    CREATE INDEX IF NOT EXISTS groups_name_trgm_idx ON learning.groups USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS groups_code_trgm_idx ON learning.groups USING gin (code gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS generated_documents_number_trgm_idx ON documents.generated_documents USING gin (
      document_number gin_trgm_ops
    );
  END IF;
END $$;
