-- Adds the IAM role `learner` plus a seed user, so that learners authenticated
-- via magic link have non-empty permission sets. Before this migration the
-- production RBAC denied learners read of their own progress / enrollments
-- and write of progress updates (PATCH /progress/materials/:id was 403).
--
-- Ownership-level safety (anti-IDOR) is already enforced inside
-- mvp.service.ts:assertActorMatchesLearnerIamLink — granting
-- `progress.recalculate` to the learner role is safe because the service
-- requires actorId === learner.linkedIamUserId for any mutation.

INSERT INTO iam.roles (id, tenant_id, code, name)
VALUES ('r_learner', 'tenant_demo', 'learner', 'Учащийся')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.users (id, tenant_id, login, email, password_hash, status, display_name)
VALUES (
  'u_learner',
  'tenant_demo',
  'learner',
  'learner@demo.local',
  'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264',
  'active',
  'Demo Learner'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.user_roles (id, tenant_id, user_id, role_id)
VALUES ('ur_learner', 'tenant_demo', 'u_learner', 'r_learner')
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON TRUE
WHERE r.tenant_id = 'tenant_demo'
  AND r.code = 'learner'
  AND p.code IN (
    'tenant.read',
    'courses.read',
    'materials.read',
    'enrollments.read',
    'progress.read',
    'progress.recalculate',
    'assessment.tests.read',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.results.read',
    'assessment.assignments.read',
    'assessment.submissions.submit'
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
