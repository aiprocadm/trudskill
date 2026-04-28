import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { AuditService } from '../audit/audit.service.js';
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
  it('blocks refresh token replay after rotation', async () => {
    const auth = new AuthService(new IamService(), new AuditService(), new SecretsService());
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );

    const rotated = await auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context);

    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('blocks refresh after explicit session logout', async () => {
    const auth = new AuthService(new IamService(), new AuditService(), new SecretsService());
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );

    await auth.logout('tenant_demo', 'u_tenant_admin', login.sessionId, context);

    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('revokes all active sessions and logs the auth event', async () => {
    const audit = new AuditService();
    const auth = new AuthService(new IamService(), audit, new SecretsService());

    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    await auth.logoutAll('tenant_demo', 'u_tenant_admin', context);

    expect(
      (await auth.listSessions('tenant_demo', 'u_tenant_admin')).every((session) =>
        Boolean(session.revokedAt)
      )
    ).toBe(true);
    expect(
      (await auth.getAuthEvents('tenant_demo')).some((event) => event.type === 'logout_all')
    ).toBe(true);
    expect((await audit.list()).some((record) => record.action === 'auth.logout_all')).toBe(true);
  });
});
