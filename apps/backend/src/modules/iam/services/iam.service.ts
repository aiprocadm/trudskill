import { Injectable, NotFoundException } from '@nestjs/common';
import type { Permission, Role, User } from '../iam.types.js';
import { hashPassword } from '../crypto.util.js';

@Injectable()
export class IamService {
  private readonly users: User[] = [
    {
      id: 'u_platform_admin',
      tenantId: 'tenant_demo',
      login: 'platform_admin',
      email: 'platform@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Platform Admin'
    },
    {
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: 'tenant@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Tenant Admin'
    },
    {
      id: 'u_manager',
      tenantId: 'tenant_demo',
      login: 'manager',
      email: 'manager@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Manager'
    },
    {
      id: 'u_methodist',
      tenantId: 'tenant_demo',
      login: 'methodist',
      email: 'methodist@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Methodist'
    },
    {
      id: 'u_blocked',
      tenantId: 'tenant_demo',
      login: 'blocked_user',
      email: 'blocked@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'blocked',
      displayName: 'Blocked User'
    }
  ];

  private readonly roles: Role[] = [
    { id: 'r_platform_admin', tenantId: 'tenant_demo', code: 'platform_admin', name: 'Platform admin' },
    { id: 'r_tenant_admin', tenantId: 'tenant_demo', code: 'tenant_admin', name: 'Tenant admin' },
    { id: 'r_manager', tenantId: 'tenant_demo', code: 'manager', name: 'Manager' },
    { id: 'r_methodist', tenantId: 'tenant_demo', code: 'methodist', name: 'Methodist' }
  ];

  private readonly permissions: Permission[] = [
    { id: 'p_auth_manage_sessions', code: 'auth.manage_sessions', description: 'Manage sessions' },
    { id: 'p_iam_manage_roles', code: 'iam.manage_roles', description: 'Assign roles' },
    { id: 'p_tenant_read', code: 'tenant.read', description: 'Read tenant' }
  ];

  private readonly rolePermissions = new Map<string, string[]>([
    ['r_platform_admin', ['auth.manage_sessions', 'iam.manage_roles', 'tenant.read']],
    ['r_tenant_admin', ['auth.manage_sessions', 'iam.manage_roles', 'tenant.read']],
    ['r_manager', ['tenant.read']],
    ['r_methodist', ['tenant.read']]
  ]);

  private userRoles = new Map<string, string[]>([
    ['u_platform_admin', ['r_platform_admin']],
    ['u_tenant_admin', ['r_tenant_admin']],
    ['u_manager', ['r_manager']],
    ['u_methodist', ['r_methodist']],
    ['u_blocked', ['r_manager']]
  ]);

  findUserByLogin(tenantId: string, login: string): User | undefined {
    return this.users.find((user) => user.tenantId === tenantId && user.login === login);
  }

  getUser(tenantId: string, userId: string): User {
    const user = this.users.find((item) => item.id === userId && item.tenantId === tenantId);
    if (!user) {
      throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });
    }
    return user;
  }

  getRoles(tenantId: string): Role[] {
    return this.roles.filter((role) => role.tenantId === tenantId);
  }

  getPermissions(): Permission[] {
    return this.permissions;
  }

  getUserRoles(tenantId: string, userId: string): Role[] {
    this.getUser(tenantId, userId);
    const roleIds = this.userRoles.get(userId) ?? [];
    return roleIds.map((id) => this.roles.find((role) => role.id === id)).filter(Boolean) as Role[];
  }

  setUserRoles(tenantId: string, userId: string, roleCodes: string[]): Role[] {
    this.getUser(tenantId, userId);
    const roles = roleCodes.map((code) => {
      const role = this.roles.find((item) => item.tenantId === tenantId && item.code === code);
      if (!role) {
        throw new NotFoundException({ code: 'role_not_found', message: `Role ${code} not found` });
      }
      return role;
    });

    this.userRoles.set(
      userId,
      roles.map((item) => item.id)
    );

    return roles;
  }

  resolvePermissions(tenantId: string, userId: string): string[] {
    const roles = this.getUserRoles(tenantId, userId);
    return [...new Set(roles.flatMap((role) => this.rolePermissions.get(role.id) ?? []))];
  }
}
