-- МГ-F3.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 19.1, РМ125): номер документа уникален
-- в пределах ВИДА документа, а не на весь учебный центр.
--
-- CDOPROF нумерует «номер приказа = код группы» и «номер протокола = код группы»: у приказа
-- о зачислении и протокола проверки знаний группы 264501 один и тот же номер 264501. Индекс
-- 0002 `(tenant_id, document_number)` запрещал это — запись выпущенного документа в
-- нормализованную таблицу упала бы. Внутри вида дубль по-прежнему запрещён.
--
-- Ограничение только ослабляется: всё, что проходило прежний индекс, проходит и новый,
-- данные не меняются. `kind_code` заполняет проекция (`kindCode ?? documentType`, 0108);
-- пустой вид сводится к '' — у старых строк без вида уникальность прежняя в пределах ''.
--
-- Последняя линия обороны от дубля — `documents.issued_number_claims` (0088) — ключа не
-- меняет: у документа с видом заявляется «вид␟номер», у документа без вида — номер, как раньше.

create unique index if not exists generated_documents_tenant_kind_number_uniq
  on documents.generated_documents (tenant_id, coalesce(kind_code, ''), document_number)
  where document_number is not null;

drop index if exists documents.generated_documents_tenant_number_uniq;

comment on index documents.generated_documents_tenant_kind_number_uniq is
  'МГ-F3.1: номер документа уникален в пределах вида (приказ и протокол группы могут носить её код).';
