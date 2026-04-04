import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
  userRoles: vi.fn(),
  logout: vi.fn()
}));

vi.mock('../lib/auth/auth-api', () => ({ authApi: authApiMock }));

import { sessionManager } from '../lib/auth/session-manager';
import { sessionStore } from '../lib/auth/session-store';

const KEY = 'cdoprof.session.v1';
const originalWindow = globalThis.window;

const createLocalStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  };
};

describe('session bootstrap after hard reload (e2e logic)', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });

  beforeEach(() => {
    sessionStore.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('restores session via cookie-based refresh when only non-sensitive data survives reload', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        user: {
          id: 'u_tenant_admin',
          tenantId: 'tenant_demo',
          login: 'tenant_admin',
          email: null,
          status: 'active',
          displayName: 'Tenant Admin'
        },
        roles: ['tenant_admin'],
        permissions: ['iam.manage_roles']
      })
    );

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

    expect(authApiMock.refresh).toHaveBeenCalledWith();
    expect(session?.tokens.accessToken).toBe('a2');
    expect(session?.permissions).toContain('iam.manage_roles');
  });

  it('predictably logs out when refresh cannot restore a reloaded session', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        user: {
          id: 'u_tenant_admin',
          tenantId: 'tenant_demo',
          login: 'tenant_admin',
          email: null,
          status: 'active',
          displayName: 'Tenant Admin'
        },
        roles: ['tenant_admin'],
        permissions: ['iam.manage_roles']
      })
    );
    authApiMock.refresh.mockRejectedValue(new Error('missing_refresh_cookie'));

    const session = await sessionManager.bootstrap();

    expect(session).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true
  });
});
