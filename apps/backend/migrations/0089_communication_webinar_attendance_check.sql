-- apps/backend/migrations/0089_communication_webinar_attendance_check.sql
--
-- Журнал 330: ограничение стояло на МЁРТВОМ близнеце таблицы.
--
-- `comm.webinar_attendees.attendance_status` защищён CHECK-ом с 0014, но схема `comm` не
-- используется вовсе: девять таблиц, ноль строк, ноль обращений из кода. Живёт и пишется
-- `communication.webinar_participants` — и у неё ограничения НЕ БЫЛО НИКОГДА. То есть защита
-- была написана для таблицы, в которую никто не пишет, а настоящая колонка принимала любую
-- строку. Читатель миграций при этом видит CHECK и считает данные защищёнными.
--
-- Набор значений берётся из КОДА, а не из мёртвого близнеца: там свой словарь
-- (`registered`/`attended`/`missed`/`cancelled`), которым продукт не пользуется. Сервис
-- вебинаров пишет ровно три: `invited` при приглашении, `joined` при подключении, `left`
-- при выходе.
--
-- `not valid` — по образцу самого 0014: существующие строки не проверяются (в них может
-- лежать что угодно, накопленное без ограничения), а новые записи проверяются с этого
-- момента. Валидацию старых строк, если понадобится, делают отдельным шагом под нагрузкой.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'communication_webinar_participants_attendance_status_chk'
  ) THEN
    ALTER TABLE communication.webinar_participants
      ADD CONSTRAINT communication_webinar_participants_attendance_status_chk
      CHECK (attendance_status IN ('invited', 'joined', 'left')) NOT VALID;
  END IF;
END
$$;
