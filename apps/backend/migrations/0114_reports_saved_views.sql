-- 0114_reports_saved_views.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 2, срез 11.3 (МГ-H4.1 «Сохранённые представления на сервере»,
-- решения РМ106–РМ108).
--
-- ЗАЧЕМ. Свои отборы реестра слушателей жили в `localStorage` браузера: на другом устройстве
-- их нет, при чистке хранилища они пропадают, поделиться с коллегой нельзя. ТЗ §11 требует
-- представления на сервере (`reports.saved_views`): сущность, отбор, колонки, сортировка, имя,
-- область — своё (private) или всего центра (tenant). Таблица одна на все реестры: `entity`
-- называет, к какому экрану относится представление.
--
-- Аддитивно: новая схема `reports` (если её ещё нет) и одна таблица; старые данные не трогаются.

create schema if not exists reports;

create table if not exists reports.saved_views (
  id text primary key,
  tenant_id text not null references core.tenants(id),
  owner_user_id text not null,
  -- 'learners', 'groups', … — реестр, к которому относится представление.
  entity text not null,
  name text not null,
  -- private — видит только владелец; tenant — все сотрудники центра (заводит тот, кто вправе менять настройки).
  scope text not null default 'private' check (scope in ('private', 'tenant')),
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  sort text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint saved_views_name_not_blank check (length(trim(name)) > 0)
);

-- Список представлений экрана: свои и общие центра, живые.
create index if not exists saved_views_tenant_entity_owner_idx
  on reports.saved_views (tenant_id, entity, owner_user_id)
  where deleted_at is null;

create index if not exists saved_views_tenant_entity_scope_idx
  on reports.saved_views (tenant_id, entity, scope)
  where deleted_at is null;
