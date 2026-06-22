-- apps/backend/migrations/0056_payments_provider_settings.sql
-- Phase 7 activation — multi-provider per-tenant payment selection.
-- Mirrors 0055 (webinar provider seam): a per-tenant NON-SECRET provider settings table +
-- the payments.configure permission. Acquirer credentials stay in env (one platform merchant);
-- per-tenant own-merchant secrets are a separate future spec.

insert into iam.permissions (id, code, description)
values
  ('p_payments_configure', 'payments.configure', 'Configure the tenant payment provider')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and p.code = 'payments.configure'
  and r.code in ('platform_admin', 'tenant_admin')
on conflict (tenant_id, role_id, permission_id) do nothing;

create table if not exists payments.payment_provider_settings (
  tenant_id text primary key,
  provider_code text not null default 'noop',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
