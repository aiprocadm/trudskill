-- РМ127 (ТЗ перехода с CDOPROF, Фаза 3, срез 21.4): перевыпуск документа с номером из данных
-- группы сохраняет номер.
--
-- «Номер приказа = код группы», «номер удостоверения = номер протокола + порядок» (МГ-F3.1):
-- такой номер вычисляется из группы, и у перевыпущенного документа он тот же. Оригинал при
-- перевыпуске аннулируется (`status = 'revoked'`), но строка остаётся в реестре — индекс 0117
-- `(tenant_id, coalesce(kind_code, ''), document_number)` не пускал бы замену с тем же номером.
--
-- Аннулированный документ номер больше не держит: уникальность номера — среди ДЕЙСТВУЮЩИХ
-- документов вида. Ограничение только ослабляется, данные не меняются. Защита от дубля при
-- выдаче остаётся прежней: у замены — тот же резерв номера, что у оригинала (заявка 0088).
--
-- Новый индекс ставится РАНЬШЕ, чем снимается прежний, — между операциями таблица не
-- остаётся без защиты.

create unique index if not exists generated_documents_tenant_kind_number_live_uniq
  on documents.generated_documents (tenant_id, coalesce(kind_code, ''), document_number)
  where document_number is not null and status <> 'revoked';

drop index if exists documents.generated_documents_tenant_kind_number_uniq;

comment on index documents.generated_documents_tenant_kind_number_live_uniq is
  'МГ-F3.1, РМ127: номер уникален среди действующих документов вида; аннулированный при перевыпуске оригинал номер не держит.';
