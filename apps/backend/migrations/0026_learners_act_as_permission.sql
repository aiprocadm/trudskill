-- Delegation: staff may mutate learner-scoped MVP flows when learner has linkedIamUserId (MvpService).
INSERT INTO iam.permissions (id, code, description)
VALUES (
  'p_learners_act_as',
  'learners.act_as',
  'Perform progress/submissions/attempt mutations on behalf of learners linked to IAM'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  CONCAT('rp_act_as_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'learners.act_as'
WHERE r.tenant_id = 'tenant_demo'
  AND r.code IN ('platform_admin', 'tenant_admin', 'manager', 'methodist')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
