export const rolePermissionMap: Record<string, string[]> = {
  platform_admin: ['auth.manage_sessions', 'iam.manage_roles', 'tenant.read'],
  tenant_admin: ['auth.manage_sessions', 'iam.manage_roles', 'tenant.read'],
  manager: ['tenant.read'],
  methodist: ['tenant.read']
};

export const resolveRolePermissions = (roleCodes: string[]): string[] =>
  [...new Set(roleCodes.flatMap((roleCode) => rolePermissionMap[roleCode] ?? []))];
