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
    'enrollments.read'
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
    'enrollments.read'
  ],
  manager: ['users.read', 'tenant.read', 'counterparties.read', 'directions.read', 'courses.read', 'groups.read', 'enrollments.read'],
  methodist: ['users.read', 'tenant.read', 'directions.read', 'courses.read', 'groups.read'],
  learner: ['enrollments.read']
};

export const resolveRolePermissions = (roleCodes: string[]): string[] =>
  [...new Set(roleCodes.flatMap((roleCode) => rolePermissionMap[roleCode] ?? []))];
