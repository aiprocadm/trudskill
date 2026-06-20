-- apps/backend/migrations/0055_communication_webinar_provider_seam.sql
-- Phase 8 — provider-agnostic webinar seam (dormant, multi-provider, per-tenant).
-- No changes to communication.webinars / webinar_participants (they exist since 0007 with all
-- needed columns). This migration adds: (1) four webinar permissions, (2) a per-tenant provider
-- settings table holding NON-SECRET config only, (3) a lookup index for the webhook tenant resolve.

insert into iam.permissions (id, code, description)
values
  ('p_webinars_read', 'webinars.read', 'List/read webinars and participants'),
  ('p_webinars_write', 'webinars.write', 'Create/manage webinars and participants'),
  ('p_webinars_attend', 'webinars.attend', 'View own webinars and obtain join link (learner)'),
  ('p_webinars_configure', 'webinars.configure', 'Configure the tenant webinar provider')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    (p.code in ('webinars.read', 'webinars.write') and r.code in ('platform_admin', 'tenant_admin', 'methodist'))
    or (p.code = 'webinars.attend' and r.code = 'learner')
    or (p.code = 'webinars.configure' and r.code in ('platform_admin', 'tenant_admin'))
  )
on conflict (tenant_id, role_id, permission_id) do nothing;

create table if not exists communication.webinar_provider_settings (
  tenant_id text primary key,
  provider_code text not null default 'noop',
  base_url text null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_webinars_provider_session_id
  on communication.webinars (provider_session_id)
  where provider_session_id is not null;
