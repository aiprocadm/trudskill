-- apps/backend/migrations/0057_iam_integrations_permissions.sql
-- Phase 11 hardening — seed the integrations.read / integrations.write permissions and assign
-- them to admin roles. The IntegrationsController / ExportsController / SyncLogsController were
-- TenantGuard-only (any authenticated tenant user could create/rotate credentials, run exports,
-- read sync logs, and mutate integration providers). These permissions back the PermissionGuard
-- now applied on those controllers. Mirrors 0056 (payments.configure) seeding shape.

insert into iam.permissions (id, code, description)
values
  ('p_integrations_read', 'integrations.read', 'Read integration providers, credentials, exports and sync logs'),
  ('p_integrations_write', 'integrations.write', 'Manage integration providers, credentials, exports and sync logs')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and p.code in ('integrations.read', 'integrations.write')
  and r.code in ('platform_admin', 'tenant_admin')
on conflict (tenant_id, role_id, permission_id) do nothing;
