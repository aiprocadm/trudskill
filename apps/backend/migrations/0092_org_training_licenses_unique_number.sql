-- Журнал 353 (§5.427): обещание «две лицензии с одним номером не заведутся» подперто базой.
--
-- Что было. `licenses.service.ts` перед вставкой спрашивает `findByTypeAndNumber` и на
-- совпадение отвечает `license_number_conflict`. Но проверка и вставка — ДВЕ операции, между
-- которыми проходит время: два администратора центра, нажавшие «Добавить» одновременно, обе
-- проверки проходят (ни одна ещё не видит чужую запись), и в реестре центра оказываются две
-- лицензии с одним номером и типом. Для регулируемого центра это не косметика: лицензия —
-- основание вести обучение, и её номер попадает в документы и в выгрузки.
--
-- Почему именно (tenant_id, license_type, license_number). Ровно этот набор спрашивает код
-- (`where tenant_id = $1 and license_type = $2 and license_number = $3`), и правило берётся
-- у него, а не придумывается заново. Статус в набор НЕ входит намеренно: проверка в коде его
-- тоже не учитывает — номер занят и архивной лицензией, потому что архивная лицензия не
-- перестаёт существовать в отчётности.
--
-- Уже существующие дубли. Индекс на такой таблице просто не создастся, и миграция упадёт с
-- невнятным сообщением Postgres про «could not create unique index». Поэтому дубли ищутся
-- ЗАРАНЕЕ и называются поимённо: администратору платформы нужно знать, какие именно записи
-- разводить, а не гадать по имени индекса.

do $$
declare
  duplicates text;
begin
  select string_agg(
           format('центр %s, тип %s, номер %s — %s шт.', tenant_id, license_type,
                  license_number, count),
           E'\n')
    into duplicates
    from (
      select tenant_id, license_type, license_number, count(*) as count
        from org.training_licenses
       group by tenant_id, license_type, license_number
      having count(*) > 1
    ) as clashes;

  if duplicates is not null then
    raise exception E'Нельзя завести уникальность лицензий: в базе уже есть дубли.\n%\nРазведите их (исправьте номер или удалите лишнюю запись) и повторите миграцию.', duplicates;
  end if;
end
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_licenses_tenant_type_number
  ON org.training_licenses (tenant_id, license_type, license_number);

COMMENT ON INDEX org.uq_training_licenses_tenant_type_number IS
  'Журнал 353: номер лицензии уникален в пределах центра и типа — проверка в коде не переживает двух одновременных запросов';
