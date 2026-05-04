import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';

const context = {
  requestId: 'req_int_1',
  correlationId: 'corr_int_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('auth integration foundation', () => {
  it('supports logout-all and revokes all active sessions for user', async () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit, new SecretsService());

    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    expect(
      (await auth.listSessions('tenant_demo', 'u_tenant_admin')).filter((item) => !item.revokedAt)
    ).toHaveLength(2);

    await auth.logoutAll('tenant_demo', 'u_tenant_admin', context);

    expect(
      (await auth.listSessions('tenant_demo', 'u_tenant_admin')).every((item) =>
        Boolean(item.revokedAt)
      )
    ).toBe(true);
  });

  it('revokes selected session', async () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    await auth.revokeSession('tenant_demo', 'u_tenant_admin', login.sessionId, context);

    expect((await auth.listSessions('tenant_demo', 'u_tenant_admin'))[0]?.revokedAt).toBeDefined();
  });

  it('does not refresh with token from another tenant', async () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );

    await expect(
      auth.refresh('tenant_other', login.refreshToken, login.csrfToken, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('writes audit event on session revoke', async () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    await auth.revokeSession('tenant_demo', 'u_tenant_admin', login.sessionId, context);

    expect(
      (await audit.list('tenant_demo')).some((record) => record.action === 'auth.session_revoke')
    ).toBe(true);
  });

  it('rejects refresh for expired session and revokes it', async () => {
    const audit = new AuditService();
    const iam = new IamService();
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    const session = (await auth.listSessions('tenant_demo', 'u_tenant_admin')).find(
      (item) => item.id === login.sessionId
    );
    expect(session).toBeDefined();
    session!.expiresAt = new Date(Date.now() - 60_000).toISOString();

    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toThrow(UnauthorizedException);
    expect(
      (await auth.listSessions('tenant_demo', 'u_tenant_admin')).find(
        (item) => item.id === login.sessionId
      )?.revokedAt
    ).toBeTruthy();
  });
});
