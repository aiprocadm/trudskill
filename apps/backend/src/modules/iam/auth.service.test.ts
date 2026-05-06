import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { verifyPassword } from './crypto.util.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';

import type { User } from './iam.types.js';

const context = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const LEGACY_SEED_PASSWORD_HASH =
  'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264';

function forceLegacyPasswordHashForTest(iam: IamService, userId: string) {
  const store = iam as unknown as { fallbackUsers: User[] };
  const user = store.fallbackUsers.find((u) => u.tenantId === 'tenant_demo' && u.id === userId);
  if (!user) {
    throw new Error(`test user ${userId} not found`);
  }
  user.passwordHash = LEGACY_SEED_PASSWORD_HASH;
}

describe('auth foundation', () => {
  it('rehashes legacy sha256 password to scrypt on successful login', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    forceLegacyPasswordHashForTest(iam, 'u_tenant_admin');
    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);

    expect(
      (await audit.list('tenant_demo')).some(
        (r) =>
          r.action === 'iam.password_rehashed' &&
          r.entityId === 'u_tenant_admin' &&
          r.metadata?.reason === 'legacy_sha256_seed'
      )
    ).toBe(true);

    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    expect(resolved!.user.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('Password123!', resolved!.user.passwordHash)).toBe(true);
  });

  it('verifies password hash', async () => {
    const iam = new IamService(new AuditService());
    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    expect(resolved).toBeDefined();
    expect(verifyPassword('Password123!', resolved!.user.passwordHash)).toBe(true);
  });

  it('rotates refresh token and invalidates previous one', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    const rotated = await auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context);

    expect(rotated.refreshToken).not.toEqual(login.refreshToken);
    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects blocked user login', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    await expect(
      auth.login('tenant_demo', { login: 'blocked_user', password: 'Password123!' }, context)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('writes audit log on login', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    await auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context);
    expect((await audit.list('tenant_demo')).some((record) => record.action === 'auth.login')).toBe(
      true
    );
  });

  it('returns claims payload with tenant, roles, permissions and session id', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );

    expect(login.claims).toBeDefined();
    expect(login.claims?.tenant_id).toBe('tenant_demo');
    expect(login.claims?.session_id).toBe(login.sessionId);
    expect(login.claims?.role_codes).toContain('tenant_admin');
    expect(login.claims?.permission_codes).toContain('auth.manage_sessions');
  });

  it('writes audit log on role assignment changes', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);

    await iam.setUserRoles(
      'tenant_demo',
      'u_manager',
      ['manager', 'methodist'],
      'u_tenant_admin',
      'req_2'
    );

    expect(
      (await audit.list('tenant_demo')).some((record) => record.action === 'iam.user_roles_updated')
    ).toBe(true);
  });

  it('revokes only current session on logout', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const first = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    const second = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    await auth.logout('tenant_demo', 'u_tenant_admin', second.sessionId, context);

    const sessions = await auth.listSessions('tenant_demo', 'u_tenant_admin');
    expect(sessions.find((session) => session.id === second.sessionId)?.revokedAt).toBeTruthy();
    expect(sessions.find((session) => session.id === first.sessionId)?.revokedAt).toBeFalsy();
  });

  it('allows only one successful refresh under concurrent replay attempts', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
      )
    );
    const success = results.filter((result) => result.status === 'fulfilled');
    const failed = results.filter((result) => result.status === 'rejected');

    expect(success).toHaveLength(1);
    expect(failed).toHaveLength(19);
  });
});
