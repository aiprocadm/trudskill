import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sessionStore } from './session-store';

const KEY = 'trudskill.session.v1';
const LEGACY_KEY = 'cdoprof.session.v1';
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

  /** Минимальная сессия для проверок подписки. */
  const session = (id: string) => ({
    user: {
      id,
      tenantId: 'tenant_demo',
      login: id,
      email: null,
      status: 'active',
      displayName: 'Кто-то'
    },
    tokens: { accessToken: 'access', sessionId: 'session', expiresIn: 300 },
    roles: ['tenant_admin'],
    permissions: []
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
  /*
   * BR-020/BR-021 — выкатка N периода двойного чтения. Кейсы ниже доказывают ровно то,
   * ради чего он затевался: человек с открытой сессией не должен быть разлогинен, а «Выйти»
   * обязано гасить снимок под ОБОИМИ ключами.
   */
  describe('период двойного чтения ключа (BR-020/BR-021)', () => {
    const persisted = JSON.stringify({
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
    });

    it('поднимает сессию из ПРЕЖНЕГО ключа, когда нового ещё нет', () => {
      window.localStorage.setItem(LEGACY_KEY, persisted);
      const restored = sessionStore.hydrateFromStorage();
      expect(restored?.user.login).toBe('tenant_admin');
    });

    it('когда есть оба ключа — берёт НОВЫЙ', () => {
      window.localStorage.setItem(LEGACY_KEY, persisted);
      window.localStorage.setItem(
        KEY,
        JSON.stringify({
          user: {
            id: 'u_new',
            tenantId: 'tenant_demo',
            login: 'new_login',
            email: null,
            status: 'active',
            displayName: 'New'
          },
          roles: ['manager'],
          permissions: []
        })
      );
      expect(sessionStore.hydrateFromStorage()?.user.login).toBe('new_login');
    });

    it('запись идёт ВСЕГДА в новый ключ, прежний не создаётся', () => {
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
        permissions: []
      });
      expect(window.localStorage.getItem(KEY)).toBeTruthy();
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('выход гасит ОБА ключа — иначе прежний снимок воскресит сессию', () => {
      window.localStorage.setItem(LEGACY_KEY, persisted);
      window.localStorage.setItem(KEY, persisted);
      sessionStore.clear();
      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
      expect(sessionStore.hydrateFromStorage()).toBeNull();
    });

    it('битое значение под прежним ключом вычищается, а не роняет вход', () => {
      window.localStorage.setItem(LEGACY_KEY, '{не json');
      expect(sessionStore.hydrateFromStorage()).toBeNull();
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    /*
     * localStorage, в отличие от cookie, не истекает никогда: без явной уборки снимок
     * с ФИО, ролями и правами остался бы под прежним ключом навсегда — на общем
     * компьютере учебного класса это утечка персональных данных (ФТ-H6).
     */
    it('запись ПЕРЕНОСИТ снимок: прежний ключ удаляется сразу', () => {
      window.localStorage.setItem(LEGACY_KEY, persisted);
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
        permissions: []
      });
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
      expect(window.localStorage.getItem(KEY)).toBeTruthy();
    });
  });

  /*
   * В приватных режимах некоторых браузеров обращение к localStorage бросает.
   * Двойное чтение удваивает число обращений — молчаливая устойчивость обязательна,
   * иначе запуск приложения падал бы целиком.
   */
  describe('недоступное хранилище не роняет приложение', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      }
    };

    it('чтение, запись и очистка переживают исключение', () => {
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: throwing },
        configurable: true
      });
      expect(() => sessionStore.hydrateFromStorage()).not.toThrow();
      expect(sessionStore.hydrateFromStorage()).toBeNull();
      expect(() =>
        sessionStore.set({
          user: {
            id: 'u',
            tenantId: 't',
            login: 'l',
            email: null,
            status: 'active',
            displayName: 'D'
          },
          tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
          roles: [],
          permissions: []
        })
      ).not.toThrow();
      expect(() => sessionStore.clear()).not.toThrow();

      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: createLocalStorage() },
        configurable: true
      });
    });
  });
  /*
   * Ревизия 2026-09-06 (§5.424), журнал 350. Хранилище знает о смерти сессии первым, а
   * экран — последним: `AuthProvider` держит сессию в состоянии React и до этой правки
   * узнавал о ней только при перезагрузке страницы. Подписка — провод между ними.
   */
  it('подписчик узнаёт и о новой сессии, и о её конце', () => {
    const seen: Array<string | null> = [];
    const unsubscribe = sessionStore.subscribe((session) => seen.push(session?.user.id ?? null));

    sessionStore.set(session('u1'));
    sessionStore.clear();

    expect(seen).toEqual(['u1', null]);
    unsubscribe();
  });

  it('отписавшийся больше не получает вестей', () => {
    const seen: Array<string | null> = [];
    const unsubscribe = sessionStore.subscribe((s) => seen.push(s?.user.id ?? null));
    unsubscribe();

    sessionStore.set(session('u2'));

    expect(seen).toEqual([]);
  });

  it('один упавший подписчик не мешает остальным', () => {
    const seen: string[] = [];
    const first = sessionStore.subscribe(() => {
      throw new Error('подписчик сломался');
    });
    const second = sessionStore.subscribe(() => seen.push('дошло'));

    expect(() => sessionStore.clear()).not.toThrow();
    expect(seen).toEqual(['дошло']);
    first();
    second();
  });
});
