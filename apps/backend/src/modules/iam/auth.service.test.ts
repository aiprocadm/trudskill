import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { verifyPassword } from './crypto.util.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';

import type { User } from './iam.types.js';
import type { TenantAccessService } from '../../infrastructure/tenant/tenant-access.service.js';

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

describe('impersonated session (ФТ-D2.2)', () => {
  it('выдаёт сессию целевого пользователя с его ролями и правами', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const session = await auth.issueImpersonatedSession('tenant_demo', 'u_tenant_admin');
    expect(session.sessionId).toBeTruthy();
    expect(session.claims.tenant_id).toBe('tenant_demo');
    expect(session.claims.role_codes).toContain('tenant_admin');
  });

  it('заблокированный пользователь — отказ: имперсонация не обходит блокировку', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    await expect(auth.issueImpersonatedSession('tenant_demo', 'u_blocked')).rejects.toThrow(
      UnauthorizedException
    );
  });
});

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
      'req_2',
      'corr_roles_1'
    );

    const updated = (await audit.list('tenant_demo')).filter(
      (record) => record.action === 'iam.user_roles_updated'
    );
    expect(updated.length).toBeGreaterThan(0);
    expect(updated.some((r) => r.metadata?.correlation_id === 'corr_roles_1')).toBe(true);
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

describe('AuthService.issueSessionForUser', () => {
  it('returns valid session tokens for a user without password verification', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    const tokens = await auth.issueSessionForUser(resolved!.user, context, {
      authMethod: 'magic_link',
      databaseBacked: false
    });

    expect(tokens.accessToken).toBeTypeOf('string');
    expect(tokens.refreshToken).toBeTypeOf('string');
    expect(tokens.csrfToken).toBeTypeOf('string');
    expect(tokens.sessionId).toMatch(/^s_/);
    expect(tokens.claims?.session_id).toBe(tokens.sessionId);
    expect(tokens.claims?.tenant_id).toBe('tenant_demo');
    expect(tokens.claims?.role_codes).toContain('tenant_admin');
  });

  it('records magic_link_login auth event when authMethod is magic_link', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    await auth.issueSessionForUser(resolved!.user, context, {
      authMethod: 'magic_link',
      databaseBacked: false
    });

    const events = await auth.getAuthEvents('tenant_demo');
    expect(events.some((e) => e.userId === 'u_tenant_admin' && e.type === 'magic_link_login')).toBe(
      true
    );
  });

  it('writes auth.magic_link_login audit record', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    await auth.issueSessionForUser(resolved!.user, context, {
      authMethod: 'magic_link',
      databaseBacked: false
    });

    const records = await audit.list('tenant_demo');
    expect(
      records.some((r) => r.action === 'auth.magic_link_login' && r.entityId === 'u_tenant_admin')
    ).toBe(true);
  });

  it('issued session can be rotated by refresh', async () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());

    const resolved = await iam.findUserByLogin('tenant_demo', 'tenant_admin');
    const issued = await auth.issueSessionForUser(resolved!.user, context, {
      authMethod: 'magic_link',
      databaseBacked: false
    });

    const rotated = await auth.refresh(
      'tenant_demo',
      issued.refreshToken,
      issued.csrfToken,
      context
    );
    expect(rotated.refreshToken).not.toEqual(issued.refreshToken);
  });
});

/*
 * Ревизия 2026-08-27 (порция 22, журнал 266–267): блокировка обязана отбирать доступ
 * НЕМЕДЛЕННО и ЛЮБЫМ способом входа. До починки: refresh не смотрел статус и продлевал
 * цепочку бессрочно, issueSessionForUser (ЕСИА, magic-link) выдавал сессию заблокированному,
 * а отозвать чужие сессии администратору было нечем.
 */
describe('блокировка отбирает доступ немедленно (ревизия, порция 22)', () => {
  const makeAuth = () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit, new SecretsService());
    return { iam, auth };
  };

  it('issueSessionForUser отказывает заблокированному — единый гейт для ЕСИА и magic-link', async () => {
    const { iam, auth } = makeAuth();
    const blocked = await iam.getUser('tenant_demo', 'u_blocked');
    for (const authMethod of ['esia', 'magic_link'] as const) {
      await expect(
        auth.issueSessionForUser(blocked, context, { authMethod, databaseBacked: false })
      ).rejects.toMatchObject({ response: { code: 'user_blocked' } });
    }
  });

  it('отказ заблокированному стоит ДО TOTP-гейта: блокировка не выдаёт challenge', async () => {
    const { iam, auth } = makeAuth();
    const blocked = await iam.getUser('tenant_demo', 'u_blocked');
    const withTotp = { ...blocked, totpEnabled: true };
    await expect(
      auth.issueSessionForUser(withTotp, context, { authMethod: 'esia', databaseBacked: false })
    ).rejects.toMatchObject({ response: { code: 'user_blocked' } });
  });

  it('refresh отказывает заблокированному и гасит всю семью его сессий', async () => {
    const { iam, auth } = makeAuth();
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    const userId = 'u_tenant_admin';
    await iam.updateUser('tenant_demo', userId, { status: 'blocked' });

    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toMatchObject({ response: { code: 'user_blocked' } });
    // Отказ — не «попробуйте позже»: семья сессий отозвана, живых не осталось.
    await expect(auth.isSessionActive('tenant_demo', userId, login.sessionId)).resolves.toBe(false);
  });

  it('revokeAllSessionsForUser гасит все живые сессии пользователя (рычаг администратора)', async () => {
    const { auth } = makeAuth();
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
    const userId = 'u_tenant_admin';
    await auth.revokeAllSessionsForUser('tenant_demo', userId, context);
    await expect(auth.isSessionActive('tenant_demo', userId, first.sessionId)).resolves.toBe(false);
    await expect(auth.isSessionActive('tenant_demo', userId, second.sessionId)).resolves.toBe(
      false
    );
  });
});

describe('статус арендатора отбирает доступ (журнал 337)', () => {
  /** Гейт-двойник: отказывает всем, считает вызовы. */
  const makeAuth = (decision: 'allow' | 'tenant_suspended' | 'tenant_archived') => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const assertAcceptsSessions = vi.fn(async () => {
      if (decision === 'allow') return;
      throw new UnauthorizedException({ code: decision, message: 'Tenant is not active' });
    });
    const tenantAccess = { assertAcceptsSessions } as unknown as TenantAccessService;
    const auth = new AuthService(
      iam,
      audit,
      new SecretsService(),
      undefined,
      undefined,
      tenantAccess
    );
    return { iam, auth, audit, assertAcceptsSessions };
  };

  it('issueSessionForUser отказывает пользователю приостановленного центра — единый гейт для пароля, ЕСИА и magic-link', async () => {
    const { iam, auth, audit, assertAcceptsSessions } = makeAuth('tenant_suspended');
    const user = await iam.getUser('tenant_demo', 'u_tenant_admin');
    for (const authMethod of ['password', 'esia', 'magic_link'] as const) {
      await expect(
        auth.issueSessionForUser(user, context, { authMethod, databaseBacked: false })
      ).rejects.toMatchObject({ response: { code: 'tenant_suspended' } });
    }
    expect(assertAcceptsSessions).toHaveBeenCalledWith('tenant_demo');
    // Отказ у двери: ни сессии, ни записи «вошёл» в журнале.
    expect((await audit.list('tenant_demo')).some((r) => r.action === 'auth.login')).toBe(false);
    await expect(auth.listSessions('tenant_demo', user.id)).resolves.toEqual([]);
  });

  it('отказ приостановленному центру стоит ДО TOTP-гейта: challenge не выдаётся', async () => {
    const { iam, auth } = makeAuth('tenant_archived');
    const user = await iam.getUser('tenant_demo', 'u_tenant_admin');
    await expect(
      auth.issueSessionForUser({ ...user, totpEnabled: true }, context, {
        authMethod: 'esia',
        databaseBacked: false
      })
    ).rejects.toMatchObject({ response: { code: 'tenant_archived' } });
  });

  it('вход по паролю в приостановленный центр — отказ tenant_suspended, а не «неверные данные»', async () => {
    const { auth } = makeAuth('tenant_suspended');
    await expect(
      auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, context)
    ).rejects.toMatchObject({ response: { code: 'tenant_suspended' } });
  });

  it('refresh отказывает, когда центр приостановили ПОСЛЕ входа: живая вкладка не продлевает доступ', async () => {
    const { auth, assertAcceptsSessions } = makeAuth('allow');
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    assertAcceptsSessions.mockRejectedValueOnce(
      new UnauthorizedException({ code: 'tenant_suspended', message: 'Tenant is not active' })
    );
    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toMatchObject({ response: { code: 'tenant_suspended' } });
    // Refresh-токен уже потреблён ротацией — цепочка на этом кончается, второй попытки нет.
    await expect(
      auth.refresh('tenant_demo', login.refreshToken, login.csrfToken, context)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('сессия «от имени» обновляется и в приостановленном центре: поддержка вошла туда законно', async () => {
    const { auth, assertAcceptsSessions } = makeAuth('tenant_suspended');
    const session = await auth.issueImpersonatedSession(
      'tenant_demo',
      'u_tenant_admin',
      'u_support'
    );
    const rotated = await auth.refresh(
      'tenant_demo',
      session.refreshToken,
      session.csrfToken,
      context
    );
    expect(rotated.sessionId).not.toBe(session.sessionId);
    expect(assertAcceptsSessions).not.toHaveBeenCalled();
  });
});
