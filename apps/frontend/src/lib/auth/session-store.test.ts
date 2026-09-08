import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sessionStore } from './session-store';

import type { UserSession } from '../../entities/session/model';

const KEY = 'trudskill.session.v1';
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
  const session = (id: string): UserSession => ({
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
   * `BR-020` выкатка N+1: окно закрыто — снимок под прежним ключом больше не поднимается.
   *
   * Смысл теста стал обратным прежнему. Раньше он доказывал, что человека с открытой сессией
   * не разлогинит; теперь — что прежний ключ действительно перестал действовать. Это важнее,
   * чем кажется: снимок сессии содержит ФИО, роли и права, и молча читать его из ключа,
   * который мы считаем удалённым, — худший из вариантов.
   */
  describe('окно двойного чтения закрыто (BR-020/BR-021, выкатка N+1)', () => {
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

    it('снимок под ПРЕЖНИМ ключом больше не поднимает сессию', () => {
      window.localStorage.setItem('cdoprof.session.v1', persisted);
      expect(sessionStore.hydrateFromStorage()).toBeNull();
    });

    it('снимок под новым ключом поднимается как прежде', () => {
      window.localStorage.setItem(KEY, persisted);
      expect(sessionStore.hydrateFromStorage()?.user.login).toBe('tenant_admin');
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
