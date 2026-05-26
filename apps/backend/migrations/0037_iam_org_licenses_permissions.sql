-- 0037_iam_org_licenses_permissions.sql
-- Pillar A Plan C §5.10 — IAM permissions для управления лицензиями центра.
-- Раздаются platform_admin + tenant_admin (полный набор) и methodist (read).
-- Manager не получает read — лицензии относятся к юридической документации,
-- не нужны для текущей работы менеджера.

insert into iam.permissions (id, code, description)
values
  ('p_org_licenses_read', 'org.licenses.read', 'Read training licenses and accreditations'),
  ('p_org_licenses_write', 'org.licenses.write', 'Manage training licenses and accreditations')
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
    or (r.code = 'methodist' and p.code = 'org.licenses.read')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
