import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { session: null as any };

vi.mock('./session-store', () => ({
  sessionStore: {
    get: vi.fn(() => state.session),
    set: vi.fn((session) => {
      state.session = session;
    }),
    clear: vi.fn(() => {
      state.session = null;
    })
  }
}));

const authApiMock = {
  login: vi.fn(),
  me: vi.fn(),
  userRoles: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn()
};

vi.mock('./auth-api', () => ({ authApi: authApiMock }));

import { sessionManager } from './session-manager';

describe('session manager', () => {
  beforeEach(() => {
    state.session = null;
    vi.clearAllMocks();
  });

  it('bootstraps an existing session', async () => {
    state.session = {
      user: { id: 'u_tenant_admin' },
      tokens: { accessToken: 'a', refreshToken: 'r', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.me.mockResolvedValue({ id: 'u_tenant_admin', tenantId: 'tenant_demo', login: 'tenant_admin', email: null, status: 'active', displayName: 'Tenant Admin' });
    authApiMock.userRoles.mockResolvedValue([{ code: 'tenant_admin' }]);

    const session = await sessionManager.bootstrap();
    expect(session?.permissions).toContain('iam.manage_roles');
  });

  it('refresh failure clears session', async () => {
    state.session = {
      user: { id: 'u_tenant_admin' },
      tokens: { accessToken: 'a', refreshToken: 'r', sessionId: 's1', expiresIn: 10 },
      roles: [],
      permissions: []
    };
    authApiMock.refresh.mockRejectedValue(new Error('invalid_refresh'));

    const session = await sessionManager.tryRefresh();
    expect(session).toBeNull();
    expect(state.session).toBeNull();
  });
});
