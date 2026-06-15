-- apps/backend/migrations/0053_iam_documents_sign_permission.sql
-- Phase 6 — право на подписание/повторное подписание выпущенных документов
-- (POST /documents/:id/sign). Выдаётся platform_admin, tenant_admin и methodist.
-- Сама подпись провайдер-агностична (ESIGN_PROVIDER); по умолчанию Noop.

insert into iam.permissions (id, code, description)
values
  ('p_documents_sign', 'documents.sign', 'Sign or re-sign issued documents (НЭП)')
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
  and p.code = 'documents.sign'
  and r.code in ('platform_admin', 'tenant_admin', 'methodist')
on conflict (tenant_id, role_id, permission_id) do nothing;
