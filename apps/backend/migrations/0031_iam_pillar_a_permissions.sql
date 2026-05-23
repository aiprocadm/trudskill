-- apps/backend/migrations/0031_iam_pillar_a_permissions.sql
-- Stage 11: Pillar A permissions (commissions, course publish at version level, course document sets).
-- Связаны со спекой §5.1, §5.2, §5.3. Раздаются tenant_admin (полный набор)
-- и methodist (read/write на свои зоны ответственности).

insert into iam.permissions (id, code, description)
values
  ('p_learning_commissions_read', 'learning.commissions.read', 'Read attestation commissions'),
  ('p_learning_commissions_write', 'learning.commissions.write', 'Write attestation commissions'),
  ('p_learning_courses_publish', 'learning.courses.publish', 'Publish course versions with regulatory validation'),
  ('p_learning_course_document_sets_read', 'learning.course_document_sets.read', 'Read course document sets'),
  ('p_learning_course_document_sets_write', 'learning.course_document_sets.write', 'Write course document sets'),
  -- Pillar A фронт также читает /templates когда настраивает пакет документов;
  -- documents.read до сих пор не было в seed (контроллер был, но никакая роль
  -- не получала это право). Добавляем здесь, чтобы tenant_admin и methodist
  -- могли читать шаблоны при настройке курса.
  ('p_documents_read', 'documents.read', 'Read document templates and generation tasks'),
  ('p_documents_write', 'documents.write', 'Manage document templates and bindings')
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
    or (r.code = 'methodist' and p.code in (
      'learning.commissions.read',
      'learning.courses.publish',
      'learning.course_document_sets.read',
      'learning.course_document_sets.write',
      'documents.read',
      'documents.write'
    ))
    or (r.code = 'manager' and p.code in (
      'learning.commissions.read',
      'learning.course_document_sets.read',
      'documents.read'
    ))
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
