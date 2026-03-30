create table if not exists iam.role_permissions (
  id text primary key,
  tenant_id text not null references core.tenants(id),
  role_id text not null references iam.roles(id),
  permission_id text not null references iam.permissions(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, permission_id)
);

insert into core.tenants (id, code, name, status)
values ('tenant_demo', 'demo', 'Demo Tenant', 'active')
on conflict (id) do nothing;

insert into org.tenant_settings (id, tenant_id, payload)
values (
  'tenant_settings_demo',
  'tenant_demo',
  '{"locale":"ru-RU","timezone":"Europe/Moscow","academyName":"Demo Academy"}'::jsonb
)
on conflict (tenant_id) do nothing;

insert into org.tenant_requisites (id, tenant_id, legal_name, tax_number, payload)
values (
  'tenant_req_demo',
  'tenant_demo',
  'ООО Демо Академия',
  '7700000000',
  '{"address":"Москва"}'::jsonb
)
on conflict (tenant_id) do nothing;

insert into iam.permissions (id, code, description)
values
  ('p_auth_manage_sessions', 'auth.manage_sessions', 'Manage sessions'),
  ('p_iam_manage_roles', 'iam.manage_roles', 'Assign roles'),
  ('p_tenant_read', 'tenant.read', 'Read tenant'),
  ('p_counterparties_read', 'counterparties.read', 'Read counterparties'),
  ('p_counterparties_write', 'counterparties.write', 'Write counterparties'),
  ('p_learners_read', 'learners.read', 'Read learners'),
  ('p_learners_write', 'learners.write', 'Write learners'),
  ('p_directions_read', 'directions.read', 'Read directions'),
  ('p_directions_write', 'directions.write', 'Write directions'),
  ('p_courses_read', 'courses.read', 'Read courses'),
  ('p_courses_write', 'courses.write', 'Write courses'),
  ('p_courses_publish', 'courses.publish', 'Publish courses'),
  ('p_courses_archive', 'courses.archive', 'Archive courses'),
  ('p_materials_read', 'materials.read', 'Read materials'),
  ('p_materials_write', 'materials.write', 'Write materials'),
  ('p_groups_read', 'groups.read', 'Read groups'),
  ('p_groups_write', 'groups.write', 'Write groups'),
  ('p_enrollments_read', 'enrollments.read', 'Read enrollments'),
  ('p_enrollments_write', 'enrollments.write', 'Write enrollments'),
  ('p_enrollments_change_status', 'enrollments.change_status', 'Change enrollment status'),
  ('p_progress_read', 'progress.read', 'Read progress'),
  ('p_progress_recalculate', 'progress.recalculate', 'Recalculate progress'),
  ('p_assessment_question_banks_read', 'assessment.question_banks.read', 'Read question banks'),
  ('p_assessment_question_banks_write', 'assessment.question_banks.write', 'Write question banks'),
  ('p_assessment_questions_read', 'assessment.questions.read', 'Read questions'),
  ('p_assessment_questions_write', 'assessment.questions.write', 'Write questions'),
  ('p_assessment_tests_read', 'assessment.tests.read', 'Read tests'),
  ('p_assessment_tests_write', 'assessment.tests.write', 'Write tests'),
  ('p_assessment_tests_publish', 'assessment.tests.publish', 'Publish tests'),
  ('p_assessment_attempts_read', 'assessment.attempts.read', 'Read attempts'),
  ('p_assessment_attempts_take', 'assessment.attempts.take', 'Take attempts'),
  ('p_assessment_results_read', 'assessment.results.read', 'Read results'),
  ('p_assessment_assignments_read', 'assessment.assignments.read', 'Read assignments'),
  ('p_assessment_assignments_write', 'assessment.assignments.write', 'Write assignments'),
  ('p_assessment_submissions_submit', 'assessment.submissions.submit', 'Submit assignment solutions'),
  ('p_assessment_reviews_review', 'assessment.reviews.review', 'Review assignment submissions')
on conflict (id) do nothing;

insert into iam.roles (id, tenant_id, code, name)
values
  ('r_platform_admin', 'tenant_demo', 'platform_admin', 'Platform admin'),
  ('r_tenant_admin', 'tenant_demo', 'tenant_admin', 'Tenant admin'),
  ('r_manager', 'tenant_demo', 'manager', 'Manager'),
  ('r_methodist', 'tenant_demo', 'methodist', 'Methodist')
on conflict (id) do nothing;

insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name)
values
  ('u_platform_admin', 'tenant_demo', 'platform_admin', 'platform@demo.local', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264', 'active', 'Platform Admin'),
  ('u_tenant_admin', 'tenant_demo', 'tenant_admin', 'tenant@demo.local', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264', 'active', 'Tenant Admin'),
  ('u_manager', 'tenant_demo', 'manager', 'manager@demo.local', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264', 'active', 'Manager'),
  ('u_methodist', 'tenant_demo', 'methodist', 'methodist@demo.local', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264', 'active', 'Methodist'),
  ('u_blocked', 'tenant_demo', 'blocked_user', 'blocked@demo.local', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264', 'blocked', 'Blocked User')
on conflict (id) do nothing;

insert into iam.user_roles (id, tenant_id, user_id, role_id)
values
  ('ur_platform_admin', 'tenant_demo', 'u_platform_admin', 'r_platform_admin'),
  ('ur_tenant_admin', 'tenant_demo', 'u_tenant_admin', 'r_tenant_admin'),
  ('ur_manager', 'tenant_demo', 'u_manager', 'r_manager'),
  ('ur_methodist', 'tenant_demo', 'u_methodist', 'r_methodist'),
  ('ur_blocked', 'tenant_demo', 'u_blocked', 'r_manager')
on conflict (tenant_id, user_id, role_id) do nothing;

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
    or (r.code = 'manager' and p.code in (
      'tenant.read',
      'counterparties.read',
      'counterparties.write',
      'learners.read',
      'learners.write',
      'directions.read',
      'courses.read',
      'materials.read',
      'groups.read',
      'groups.write',
      'enrollments.read',
      'enrollments.write',
      'enrollments.change_status',
      'progress.read',
      'assessment.question_banks.read',
      'assessment.questions.read',
      'assessment.tests.read',
      'assessment.attempts.read',
      'assessment.attempts.take',
      'assessment.results.read',
      'assessment.assignments.read',
      'assessment.submissions.submit',
      'assessment.reviews.review'
    ))
    or (r.code = 'methodist' and p.code in (
      'tenant.read',
      'directions.read',
      'directions.write',
      'courses.read',
      'courses.write',
      'courses.publish',
      'courses.archive',
      'materials.read',
      'materials.write',
      'progress.read',
      'progress.recalculate',
      'assessment.question_banks.read',
      'assessment.question_banks.write',
      'assessment.questions.read',
      'assessment.questions.write',
      'assessment.tests.read',
      'assessment.tests.write',
      'assessment.tests.publish',
      'assessment.attempts.read',
      'assessment.results.read',
      'assessment.assignments.read',
      'assessment.assignments.write',
      'assessment.reviews.review'
    ))
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
