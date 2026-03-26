import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
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
    { id: 'p_tenant_read', code: 'tenant.read', description: 'Read tenant' },
    { id: 'p_counterparties_read', code: 'counterparties.read', description: 'Read counterparties' },
    { id: 'p_counterparties_write', code: 'counterparties.write', description: 'Write counterparties' },
    { id: 'p_learners_read', code: 'learners.read', description: 'Read learners' },
    { id: 'p_learners_write', code: 'learners.write', description: 'Write learners' },
    { id: 'p_directions_read', code: 'directions.read', description: 'Read directions' },
    { id: 'p_directions_write', code: 'directions.write', description: 'Write directions' },
    { id: 'p_courses_read', code: 'courses.read', description: 'Read courses' },
    { id: 'p_courses_write', code: 'courses.write', description: 'Write courses' },
    { id: 'p_courses_publish', code: 'courses.publish', description: 'Publish courses' },
    { id: 'p_courses_archive', code: 'courses.archive', description: 'Archive courses' },
    { id: 'p_materials_read', code: 'materials.read', description: 'Read materials' },
    { id: 'p_materials_write', code: 'materials.write', description: 'Write materials' },
    { id: 'p_groups_read', code: 'groups.read', description: 'Read groups' },
    { id: 'p_groups_write', code: 'groups.write', description: 'Write groups' },
    { id: 'p_enrollments_read', code: 'enrollments.read', description: 'Read enrollments' },
    { id: 'p_enrollments_write', code: 'enrollments.write', description: 'Write enrollments' },
    { id: 'p_enrollments_change_status', code: 'enrollments.change_status', description: 'Change enrollment status' },
    { id: 'p_progress_read', code: 'progress.read', description: 'Read progress' },
    { id: 'p_progress_recalculate', code: 'progress.recalculate', description: 'Recalculate progress' },
    { id: 'p_assessment_question_banks_read', code: 'assessment.question_banks.read', description: 'Read question banks' },
    { id: 'p_assessment_question_banks_write', code: 'assessment.question_banks.write', description: 'Write question banks' },
    { id: 'p_assessment_questions_read', code: 'assessment.questions.read', description: 'Read questions' },
    { id: 'p_assessment_questions_write', code: 'assessment.questions.write', description: 'Write questions' },
    { id: 'p_assessment_tests_read', code: 'assessment.tests.read', description: 'Read tests' },
    { id: 'p_assessment_tests_write', code: 'assessment.tests.write', description: 'Write tests' },
    { id: 'p_assessment_tests_publish', code: 'assessment.tests.publish', description: 'Publish tests' },
    { id: 'p_assessment_attempts_read', code: 'assessment.attempts.read', description: 'Read attempts' },
    { id: 'p_assessment_attempts_take', code: 'assessment.attempts.take', description: 'Take attempts' },
    { id: 'p_assessment_results_read', code: 'assessment.results.read', description: 'Read results' },
    { id: 'p_assessment_assignments_read', code: 'assessment.assignments.read', description: 'Read assignments' },
    { id: 'p_assessment_assignments_write', code: 'assessment.assignments.write', description: 'Write assignments' },
    { id: 'p_assessment_submissions_submit', code: 'assessment.submissions.submit', description: 'Submit assignment solutions' },
    { id: 'p_assessment_reviews_review', code: 'assessment.reviews.review', description: 'Review assignment submissions' }
  ];

  private readonly rolePermissions = new Map<string, string[]>([
    ['r_platform_admin', this.permissions.map((permission) => permission.code)],
    ['r_tenant_admin', this.permissions.map((permission) => permission.code)],
    [
      'r_manager',
      [
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
        'assessment.results.read',
        'assessment.assignments.read',
        'assessment.reviews.review'
      ]
    ],
    [
      'r_methodist',
      [
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
      ]
    ]
  ]);

  private userRoles = new Map<string, string[]>([
    ['u_platform_admin', ['r_platform_admin']],
    ['u_tenant_admin', ['r_tenant_admin']],
    ['u_manager', ['r_manager']],
    ['u_methodist', ['r_methodist']],
    ['u_blocked', ['r_manager']]
  ]);

  constructor(private readonly auditService: AuditService) {}

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


  listUsers(tenantId: string): User[] {
    return this.users.filter((user) => user.tenantId === tenantId);
  }

  createUser(tenantId: string, payload: { login: string; email?: string | null; displayName: string; status?: 'active' | 'blocked'; password?: string }): User {
    const user: User = {
      id: `u_${payload.login}` ,
      tenantId,
      login: payload.login,
      email: payload.email ?? null,
      passwordHash: hashPassword(payload.password ?? 'Password123!'),
      status: payload.status ?? 'active',
      displayName: payload.displayName
    };
    this.users.push(user);
    return user;
  }

  updateUser(tenantId: string, userId: string, payload: { email?: string | null; displayName?: string; status?: 'active' | 'blocked' }): User {
    const user = this.getUser(tenantId, userId);
    if (payload.email !== undefined) user.email = payload.email;
    if (payload.displayName !== undefined) user.displayName = payload.displayName;
    if (payload.status !== undefined) user.status = payload.status;
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

  setUserRoles(
    tenantId: string,
    userId: string,
    roleCodes: string[],
    actorId?: string,
    requestId?: string
  ): Role[] {
    this.getUser(tenantId, userId);
    const previousRoles = this.getUserRoles(tenantId, userId).map((role) => role.code);
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

    this.auditService.write({
      tenantId,
      actorId,
      action: 'iam.user_roles_updated',
      entityType: 'iam.user',
      entityId: userId,
      requestId,
      oldValues: { roleCodes: previousRoles },
      newValues: { roleCodes }
    });

    return roles;
  }

  resolvePermissions(tenantId: string, userId: string): string[] {
    const roles = this.getUserRoles(tenantId, userId);
    return [...new Set(roles.flatMap((role) => this.rolePermissions.get(role.id) ?? []))];
  }
}
