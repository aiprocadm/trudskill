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
      displayName: 'Tenant Admin'
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
      displayName: 'Tenant Admin'
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
});
