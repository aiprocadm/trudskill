-- 0047_communication_email_foundation.sql
-- Phase 5 Plan 5A — email notification foundation.
-- 1) communication.email_templates — per-tenant overrides of code-default email texts (spec §3.2).
-- 2) communication.email_deliveries — append-only journal of every send attempt (spec §3.3).
-- 3) iam permissions notifications.read / notifications.write + role assignments.

create table if not exists communication.email_templates (
  id text primary key,
  tenant_id text not null,
  template_key text not null,
  subject text not null,
  body text not null,
  updated_by text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_email_templates_tenant_key
  on communication.email_templates (tenant_id, template_key);

create table if not exists communication.email_deliveries (
  id text primary key,
  tenant_id text not null,
  template_key text not null,
  recipient_email text not null,
  recipient_kind text not null,
  subject text not null,
  status text not null,
  provider_message_id text null,
  error text null,
  related_entity_type text null,
  related_entity_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_deliveries_tenant_created
  on communication.email_deliveries (tenant_id, created_at);
create index if not exists idx_email_deliveries_tenant_template
  on communication.email_deliveries (tenant_id, template_key);

insert into iam.permissions (id, code, description)
values
  ('p_notifications_read', 'notifications.read', 'Read notification deliveries and email templates'),
  ('p_notifications_write', 'notifications.write', 'Manage notification email templates')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    r.code in ('platform_admin', 'tenant_admin')
    or (r.code = 'methodist' and p.code = 'notifications.read')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
