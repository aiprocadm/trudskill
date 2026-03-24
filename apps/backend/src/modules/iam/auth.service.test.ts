import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { verifyPassword } from '../crypto.util.js';
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
  it('verifies password hash', () => {
    const iam = new IamService();
    const user = iam.findUserByLogin('tenant_demo', 'tenant_admin');
    expect(user).toBeDefined();
    expect(verifyPassword('Password123!', user!.passwordHash)).toBe(true);
  });

  it('rotates refresh token and invalidates previous one', () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit);

    const login = auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    const rotated = auth.refresh('tenant_demo', login.refreshToken, context);

    expect(rotated.refreshToken).not.toEqual(login.refreshToken);
    expect(() => auth.refresh('tenant_demo', login.refreshToken, context)).toThrow(UnauthorizedException);
  });

  it('rejects blocked user login', () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit);

    expect(() =>
      auth.login('tenant_demo', { login: 'blocked_user', password: 'Password123!' }, context)
    ).toThrow(UnauthorizedException);
  });

  it('writes audit log on login', () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit);

    auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    expect(audit.list().some((record) => record.action === 'auth.login')).toBe(true);
  });
});
