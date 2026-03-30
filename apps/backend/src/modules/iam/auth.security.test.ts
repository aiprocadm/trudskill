import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';

const context = {
  requestId: 'req_sec_1',
  correlationId: 'corr_sec_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('AuthService security flows', () => {
  it('blocks refresh token replay after rotation', () => {
    const auth = new AuthService(new IamService(), new AuditService());
    const login = auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    const rotated = auth.refresh('tenant_demo', login.refreshToken, context);

    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(() => auth.refresh('tenant_demo', login.refreshToken, context)).toThrow(UnauthorizedException);
  });

  it('blocks refresh after explicit session logout', () => {
    const auth = new AuthService(new IamService(), new AuditService());
    const login = auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    auth.logout('tenant_demo', 'u_tenant_admin', login.sessionId, context);

    expect(() => auth.refresh('tenant_demo', login.refreshToken, context)).toThrow(UnauthorizedException);
  });

  it('revokes all active sessions and logs the auth event', () => {
    const audit = new AuditService();
    const auth = new AuthService(new IamService(), audit);

    auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    auth.logoutAll('tenant_demo', 'u_tenant_admin', context);

    expect(auth.listSessions('tenant_demo', 'u_tenant_admin').every((session) => Boolean(session.revokedAt))).toBe(true);
    expect(auth.getAuthEvents('tenant_demo').some((event) => event.type === 'logout_all')).toBe(true);
    expect(audit.list().some((record) => record.action === 'auth.logout_all')).toBe(true);
  });
});
