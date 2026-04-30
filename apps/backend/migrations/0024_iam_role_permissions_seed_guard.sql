-- Наполнение iam.role_permissions после гарантированного наличия таблицы (0022).
-- Применяется отдельной транзакцией от DDL, чтобы сбой seed не блокировал старт.

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON TRUE
WHERE r.tenant_id = 'tenant_demo'
  AND (
    r.code IN ('platform_admin', 'tenant_admin')
    OR (r.code = 'manager' AND p.code IN (
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
    OR (r.code = 'methodist' AND p.code IN (
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
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
