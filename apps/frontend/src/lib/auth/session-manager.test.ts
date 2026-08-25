import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: null as any }));

vi.mock('./session-store', () => ({
  sessionStore: {
    get: vi.fn(() => state.session),
    hydrateFromStorage: vi.fn(() => null),
    set: vi.fn((session) => {
      state.session = session;
    }),
    clear: vi.fn(() => {
      state.session = null;
    })
  }
}));

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  userRoles: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  magicLinkRequest: vi.fn(),
  magicLinkRedeem: vi.fn()
}));

vi.mock('./auth-api', () => ({ authApi: authApiMock }));

import { sessionManager } from './session-manager';

describe('session manager', () => {
  beforeEach(() => {
    state.session = null;
    vi.clearAllMocks();
  });

  it('bootstraps only through refresh endpoint', async () => {
    state.session = {
      user: { id: 'u_tenant_admin' },
      tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.refresh.mockResolvedValue({ accessToken: 'a2', sessionId: 's2', expiresIn: 20 });
    authApiMock.me.mockResolvedValue({
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: null,
      status: 'active',
      displayName: 'Tenant Admin',
      // §5.160: permissions now come from /auth/me (server-resolved SSOT).
      permissions: ['iam.manage_roles', 'tenant.read']
    });
    authApiMock.userRoles.mockResolvedValue([{ code: 'tenant_admin' }]);

    const session = await sessionManager.bootstrap();
    expect(authApiMock.refresh).toHaveBeenCalledTimes(1);
    expect(session?.permissions).toContain('iam.manage_roles');
  });

  it('refreshes session tokens and keeps user hydrated', async () => {
    state.session = {
      user: { id: 'u_tenant_admin' },
      tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.refresh.mockResolvedValue({ accessToken: 'a2', sessionId: 's2', expiresIn: 20 });
    authApiMock.me.mockResolvedValue({
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: null,
      status: 'active',
      displayName: 'Tenant Admin',
      // §5.160: permissions now come from /auth/me (server-resolved SSOT).
      permissions: ['iam.manage_roles', 'tenant.read']
    });
    authApiMock.userRoles.mockResolvedValue([{ code: 'tenant_admin' }]);

    const refreshed = await sessionManager.tryRefresh();

    expect(authApiMock.refresh).toHaveBeenCalledWith();
    expect(refreshed?.tokens.accessToken).toBe('a2');
    expect(state.session?.tokens.sessionId).toBe('s2');
    expect(refreshed?.permissions).toContain('iam.manage_roles');
  });

  it('loginWithMagicLink exchanges token for session and stores it', async () => {
    authApiMock.magicLinkRedeem.mockResolvedValue({
      accessToken: 'ml-access',
      sessionId: 'ml-session',
      expiresIn: 900
    });
    authApiMock.me.mockResolvedValue({
      id: 'u_magic',
      tenantId: 'tenant_demo',
      login: 'magic_abc',
      email: 'magic@example.ru',
      status: 'active',
      displayName: 'Magic User'
    });
    authApiMock.userRoles.mockResolvedValue([{ code: 'student' }]);

    const session = await sessionManager.loginWithMagicLink('raw-token-xyz');

    expect(authApiMock.magicLinkRedeem).toHaveBeenCalledWith({ token: 'raw-token-xyz' });
    if ('totpRequired' in session) {
      throw new Error('unexpected totp challenge for a user without 2FA');
    }
    expect(session.tokens.accessToken).toBe('ml-access');
    expect(session.user.id).toBe('u_magic');
    expect(state.session?.tokens.sessionId).toBe('ml-session');
  });

  it('loginWithMagicLink does not store session if redeem fails', async () => {
    authApiMock.magicLinkRedeem.mockRejectedValue(new Error('invalid_magic_link'));

    await expect(sessionManager.loginWithMagicLink('bad-token')).rejects.toThrow(
      'invalid_magic_link'
    );
    expect(authApiMock.me).not.toHaveBeenCalled();
    expect(state.session).toBeNull();
  });

  it('refresh failure clears session', async () => {
    state.session = {
      user: { id: 'u_tenant_admin' },
      tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.refresh.mockRejectedValue(new Error('invalid_refresh'));

    const session = await sessionManager.tryRefresh();
    expect(session).toBeNull();
    expect(state.session).toBeNull();
  });
  /*
   * При заходе прямо на страницу выхода память ВСЕГДА пуста: её заполняет только
   * успешное восстановление сессии, а оно идёт четырьмя запросами. Если в этом случае
   * просто почистить локальное хранилище, серверная сессия останется живой, cookie — тоже,
   * и восстановление, идущее следом, немедленно вернёт человека в кабинет: «Выйти» не
   * выходит, а на общем компьютере следующий садится под чужой учётной записью (ФТ-H6).
   */
  it('выход при пустой памяти поднимает сессию по cookie и отзывает её на сервере', async () => {
    const { sessionStore } = await import('./session-store');
    state.session = null;
    authApiMock.refresh.mockResolvedValue({ accessToken: 'a9', sessionId: 's9', expiresIn: 30 });
    authApiMock.me.mockResolvedValue({
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: null,
      status: 'active',
      displayName: 'Tenant Admin',
      permissions: []
    });
    authApiMock.userRoles.mockResolvedValue([{ code: 'tenant_admin' }]);
    authApiMock.logout.mockResolvedValue(undefined);

    await sessionManager.logout();

    expect(authApiMock.refresh).toHaveBeenCalledTimes(1);
    expect(authApiMock.logout).toHaveBeenCalledTimes(1);
    expect(authApiMock.logout).toHaveBeenCalledWith({ sessionId: 's9' }, 'a9');
    expect(sessionStore.clear).toHaveBeenCalled();
  });

  it('неподтверждённый сервером выход не выдаётся за успешный (журнал 119)', async () => {
    /*
     * Сеть отвалилась на отзыве сеанса. Локально выйти надо в любом случае — иначе человек
     * останется залогиненным на экране. Но сеанс на сервере жив до истечения срока, и на
     * общем компьютере учебного центра это чужой доступ. Значит ошибка обязана дойти
     * наверх, а не утонуть в `finally`.
     */
    const { sessionStore } = await import('./session-store');
    const { LogoutNotConfirmedError } = await import('./session-manager');
    state.session = {
      user: {
        id: 'u1',
        tenantId: 't1',
        login: 'l',
        email: null,
        status: 'active',
        displayName: 'X'
      },
      tokens: { accessToken: 'a1', sessionId: 's1', expiresIn: 300 },
      roles: [],
      permissions: []
    };
    authApiMock.logout.mockRejectedValue(new Error('network down'));

    await expect(sessionManager.logout()).rejects.toBeInstanceOf(LogoutNotConfirmedError);

    // Локальная часть выхода всё равно доведена до конца.
    expect(sessionStore.clear).toHaveBeenCalled();
  });

  it('выход без действующей cookie просто чистит хранилище', async () => {
    const { sessionStore } = await import('./session-store');
    state.session = null;
    authApiMock.refresh.mockRejectedValue(new Error('401'));

    await sessionManager.logout();

    expect(authApiMock.logout).not.toHaveBeenCalled();
    expect(sessionStore.clear).toHaveBeenCalled();
  });

  it('обычный выход зовёт ручку и тоже чистит хранилище', async () => {
    const { sessionStore } = await import('./session-store');
    state.session = {
      user: { id: 'u1' },
      tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.logout.mockResolvedValue(undefined);

    await sessionManager.logout();

    expect(authApiMock.logout).toHaveBeenCalledTimes(1);
    expect(sessionStore.clear).toHaveBeenCalledTimes(1);
  });
});
