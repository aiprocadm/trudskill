-- ТЗ «Стабилизация, UX и развитие», 12.2 — единый реестр фоновых задач.
--
-- Зачем. Очередь, воркер и карантин построены, массовое зачисление уже уходит в очередь и
-- возвращает человеку номер сообщения. Но раздела, где видно «моя задача выполняется / готово»,
-- не существует: номер сообщения человеку ничего не говорит (журнал 518). У каждой долгой
-- операции при этом своё представление о состоянии — у документов своя таблица задач, у
-- зачислений кэш идемпотентности, у госвыгрузок свой статус. Эта таблица — общий язык.
--
-- Миграция аддитивная: ничего существующего не трогает.

create table if not exists core.background_tasks (
  id text primary key,
  tenant_id text not null references core.tenants (id),
  -- Вид задачи в терминах продукта (`bulk_enrollment`, `document_issue`, `gov_export`).
  kind text not null,
  -- Название для человека: «Массовое зачисление в группу "Электробезопасность"».
  title text not null,
  -- queued | running | succeeded | failed — общий язык всех долгих операций.
  status text not null,
  -- Сколько сделано из скольких; ноль в total означает «объём заранее неизвестен».
  done_count integer not null default 0,
  total_count integer not null default 0,
  -- Причина отказа человеческими словами; технический код — не сюда.
  error_text text null,
  -- Куда идти за результатом (адрес экрана), если он есть.
  result_href text null,
  -- Кто поставил задачу: человек видит СВОИ задачи.
  created_by text null,
  -- Ключ сообщения очереди — связь с воркером и карантином.
  message_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null
);

-- Экран показывает свежие задачи центра: отбор по арендатору и времени.
create index if not exists core_background_tasks_tenant_created_idx
  on core.background_tasks (tenant_id, created_at desc);

-- Воркер отчитывается по ключу сообщения — поиск обязан быть точечным.
create index if not exists core_background_tasks_message_idx
  on core.background_tasks (tenant_id, message_id);

comment on table core.background_tasks is
  'ТЗ 12.2: единый реестр долгих операций. Раздел «Фоновые задачи» показывает его человеку.';
