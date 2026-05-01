-- Permission: bypass linked-IAM learner row scope on assessment GET/list (MvpService read guard).
INSERT INTO iam.permissions (id, code, description)
VALUES (
  'p_assessment_read_cross_learner',
  'assessment.read.cross_learner',
  'Read assessment attempts/submissions/results for any learner in the tenant'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  CONCAT('rp_cross_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'assessment.read.cross_learner'
WHERE r.tenant_id = 'tenant_demo'
  AND r.code IN ('platform_admin', 'tenant_admin', 'manager', 'methodist')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
