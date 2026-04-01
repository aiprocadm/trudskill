import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { verifyPassword } from './crypto.util.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';

const context = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('auth foundation', () => {
  it('verifies password hash', async () => {
    const iam = new IamService(new AuditService());
    const user = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    expect(user).toBeDefined();
    expect(verifyPassword('Password123!', user!.passwordHash)).toBe(true);
  });

  it('rotates refresh token and invalidates previous one', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);

    const login = await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    const rotated = await auth.refresh('tenant_demo', login.refreshToken, context);

    expect(rotated.refreshToken).not.toEqual(login.refreshToken);
    await expect(auth.refresh('tenant_demo', login.refreshToken, context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects blocked user login', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);

    await expect(
      auth.login('tenant_demo', { login: 'blocked_user', password: 'Password123!' }, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('writes audit log on login', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);

    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    expect((await audit.list()).some((record) => record.action === 'auth.login')).toBe(true);
  });

  it('writes audit log on role assignment changes', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);

    await iam.setUserRoles('tenant_demo', 'u_manager', ['manager', 'methodist'], 'u_tenant_admin', 'req_2');

    expect((await audit.list()).some((record) => record.action === 'iam.user_roles_updated')).toBe(true);
  });

  it('revokes only current session on logout', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);

    const first = await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    const second = await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    await auth.logout('tenant_demo', 'u_tenant_admin', second.sessionId, context);

    const sessions = await auth.listSessions('tenant_demo', 'u_tenant_admin');
    expect(sessions.find((session) => session.id === second.sessionId)?.revokedAt).toBeTruthy();
    expect(sessions.find((session) => session.id === first.sessionId)?.revokedAt).toBeFalsy();
  });

  it('allows only one successful refresh under concurrent replay attempts', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);
    const login = await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => auth.refresh('tenant_demo', login.refreshToken, context))
    );
    const success = results.filter((result) => result.status === 'fulfilled');
    const failed = results.filter((result) => result.status === 'rejected');

    expect(success).toHaveLength(1);
    expect(failed).toHaveLength(19);
  });
});
