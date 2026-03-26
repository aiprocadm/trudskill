export const rolePermissionMap: Record<string, string[]> = {
  platform_admin: [
    'auth.manage_sessions',
    'iam.manage_roles',
    'users.read',
    'tenant.read',
    'counterparties.read',
    'directions.read',
    'courses.read',
    'courses.publish',
    'courses.archive',
    'groups.read',
    'enrollments.read',
    'assessment.tests.read',
    'assessment.results.read',
    'assessment.assignments.read'
  ],
  tenant_admin: [
    'auth.manage_sessions',
    'iam.manage_roles',
    'users.read',
    'tenant.read',
    'counterparties.read',
    'directions.read',
    'courses.read',
    'groups.read',
    'enrollments.read',
    'assessment.tests.read',
    'assessment.results.read',
    'assessment.assignments.read'
  ],
  manager: ['users.read', 'tenant.read', 'counterparties.read', 'directions.read', 'courses.read', 'groups.read', 'enrollments.read', 'assessment.tests.read', 'assessment.attempts.take', 'assessment.submissions.submit'],
  methodist: ['users.read', 'tenant.read', 'directions.read', 'courses.read', 'groups.read', 'assessment.question_banks.write', 'assessment.tests.write'],
  learner: ['enrollments.read', 'assessment.attempts.take', 'assessment.submissions.submit']
};

export const resolveRolePermissions = (roleCodes: string[]): string[] =>
  [...new Set(roleCodes.flatMap((roleCode) => rolePermissionMap[roleCode] ?? []))];
