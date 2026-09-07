-- Журнал 356 (§5.430): участник вебинара не задваивается.
--
-- Что было. `upsertParticipantAttendance` спрашивает «есть такой участник?» и вставляет, если
-- нет. Проверка и вставка — две операции: два одновременных входа одного человека (две вкладки,
-- переподключение, повтор вебхука провайдера) проходят обе проверки и дают ДВЕ строки участия.
-- По этим строкам считают часы присутствия, а часы идут в документ об обучении — то есть дубль
-- не косметика, а неверная запись в отчётности.
--
-- Почему два индекса, а не один. Участник записывается ЛИБО пользователем системы (`user_id`),
-- либо слушателем (`learner_id`); вторая колонка при этом пуста. Один составной индекс по обеим
-- не подошёл бы: в Postgres NULL не равен NULL, и строки с пустой колонкой считались бы разными.
-- Поэтому два частичных индекса — каждый по своей колонке и только по заполненным строкам.
--
-- Существующие дубли СЛИВАЮТСЯ, а не удаляются вслепую: у оставшейся строки берутся самые
-- полные значения (раннее время входа, позднее время выхода, наибольшая длительность), и только
-- после этого лишние строки убираются. Так ни один факт присутствия не теряется. Что именно
-- слито — печатается в журнал миграции.

do $$
declare
  merged integer := 0;
begin
  -- Слияние по слушателям и по пользователям одним проходом: ключ — та колонка, что заполнена.
  with grouped as (
    select
      tenant_id,
      webinar_id,
      coalesce(learner_id, user_id) as participant,
      (learner_id is not null) as by_learner,
      min(id) as keep_id,
      min(joined_at) as joined_at,
      max(left_at) as left_at,
      max(duration_seconds) as duration_seconds,
      count(*) as rows_count
    from communication.webinar_participants
    where coalesce(learner_id, user_id) is not null
    group by tenant_id, webinar_id, coalesce(learner_id, user_id), (learner_id is not null)
    having count(*) > 1
  ),
  fullest as (
    update communication.webinar_participants p
       set joined_at = g.joined_at,
           left_at = g.left_at,
           duration_seconds = g.duration_seconds
      from grouped g
     where p.id = g.keep_id
    returning p.id
  )
  delete from communication.webinar_participants p
   using grouped g
   where p.tenant_id = g.tenant_id
     and p.webinar_id = g.webinar_id
     and coalesce(p.learner_id, p.user_id) = g.participant
     and (p.learner_id is not null) = g.by_learner
     and p.id <> g.keep_id;

  get diagnostics merged = row_count;
  if merged > 0 then
    raise notice 'Слито дублей участия: % (значения присутствия перенесены в оставшуюся строку)', merged;
  end if;
end
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webinar_participants_learner
  ON communication.webinar_participants (tenant_id, webinar_id, learner_id)
  WHERE learner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webinar_participants_user
  ON communication.webinar_participants (tenant_id, webinar_id, user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON INDEX communication.uq_webinar_participants_learner IS
  'Журнал 356: слушатель числится на вебинаре один раз — по строкам участия считают часы';
COMMENT ON INDEX communication.uq_webinar_participants_user IS
  'Журнал 356: сотрудник числится на вебинаре один раз — по строкам участия считают часы';
