-- 0115_consent_facts_source_evidence.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 2, срез 12.1 (МГ-C5.1 «Согласие на ПДн: мост», решения РМ109–РМ111).
--
-- ЗАЧЕМ. Факт согласия (0069) умел быть только «дано самим слушателем на экране»: ни откуда
-- он взялся (бумага, перенос из CDOPROF), ни кто его отметил, ни где скан — записать было
-- негде. Куратор, получивший подписанный лист, не мог зафиксировать это в системе, а отчёт
-- «согласие есть/нет» опирался на пустоту. Три аддитивные колонки:
--   • source — self (сам на экране) | paper (бумага, отметил сотрудник) | legacy (перенос
--     старого единого согласия) | imported (перенос из прежней системы, «Сдал»);
--   • actor_user_id — кто отметил бумажное согласие (у self совпадает с самим слушателем);
--   • evidence_file_id — скан согласия из личного дела слушателя (storage.files), если есть.
-- Старые строки получают source = 'self' (они и были даны на экране), остальное пусто.

alter table learning.consent_facts
  add column if not exists source text not null default 'self';

alter table learning.consent_facts
  add column if not exists actor_user_id text null;

alter table learning.consent_facts
  add column if not exists evidence_file_id text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'consent_facts_source_chk'
  ) then
    alter table learning.consent_facts
      add constraint consent_facts_source_chk
      check (source in ('self', 'paper', 'legacy', 'imported'));
  end if;
end $$;
