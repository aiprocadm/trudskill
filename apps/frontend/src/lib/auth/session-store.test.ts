import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sessionStore } from './session-store';

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

describe('session store', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true
    });
  });

  beforeEach(() => {
    sessionStore.clear();
    window.localStorage.clear();
  });

  it('persists only non-sensitive session data to localStorage', () => {
    sessionStore.set({
      user: {
        id: 'u_tenant_admin',
        tenantId: 'tenant_demo',
        login: 'tenant_admin',
        email: null,
        status: 'active',
        displayName: 'Tenant Admin'
      },
      tokens: { accessToken: 'access', sessionId: 'session', expiresIn: 300 },
      roles: ['tenant_admin'],
      permissions: ['iam.manage_roles']
    });

    const raw = window.localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('access');
    expect(raw).not.toContain('refresh');
    expect(raw).toContain('tenant_admin');
  });

  it('drops malformed persisted payload', () => {
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
        roles: ['tenant_admin']
      })
    );

    const restored = sessionStore.hydrateFromStorage();
    expect(restored).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
