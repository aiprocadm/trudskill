import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
  userRoles: vi.fn(),
  logout: vi.fn()
}));

vi.mock('../lib/auth/auth-api', () => ({ authApi: authApiMock }));

import { APP_ROOT } from './app-root';
import { getRouteBootstrapState } from '../features/auth/use-route-bootstrap';
import { sessionManager } from '../lib/auth/session-manager';
import { sessionStore } from '../lib/auth/session-store';

/**
 * Истёкшая сессия доводит человека до экрана входа — сама, а не после F5 (журнал 350).
 *
 * Токен доступа живёт 15 минут (`ACCESS_TOKEN_TTL_SECONDS`, умолчание 900), сессия по
 * cookie — много дольше. Через четверть часа работы каждый запрос начинал отвечать 401, и
 * приложение не делало ничего: `isAuthError` вычислялся и никем не читался, клиент не
 * обновлял сессию, контекст входа узнавал о её смерти только при перезагрузке страницы.
 * Человек читал «Вход не выполнен или срок сессии истёк. Войдите заново», оставался на
 * закрытом экране и получал то же самое на каждое действие — пока не догадывался нажать F5,
 * потому что перезагрузка запускает восстановление сессии и всё чинит.
 *
 * Здесь проверяется вся цепочка настоящими модулями, без монтирования React (в наборе нет
 * React Testing Library — см. CLAUDE.md): восстановление сессии → хранилище → решение о
 * переходе, которое читает `ProtectedRoute`.
 */

const createLocalStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  };
};

const LIVE_SESSION = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Администратор центра'
  },
  tokens: { accessToken: 'token_stale', sessionId: 's1', expiresIn: 900 },
  roles: ['tenant_admin'],
  permissions: ['groups.read']
};

describe('истёкшая сессия доводит до входа сама', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.clear();
  });

  it('обновить нечем — сессия кончилась, и экран это видит', async () => {
    sessionStore.set(LIVE_SESSION as never);
    authApiMock.refresh.mockRejectedValueOnce(new Error('refresh cookie expired'));

    const seen: Array<unknown> = [];
    const unsubscribe = sessionStore.subscribe((session) => seen.push(session));

    const token = await sessionManager.recoverSession();

    expect(token).toBeNull();
    expect(sessionStore.get()).toBeNull();
    // Именно этого раньше не происходило: контекст входа не узнавал о конце сессии.
    expect(seen).toEqual([null]);
    unsubscribe();
  });

  it('без сессии закрытый экран уводит на вход, а не показывает отказ', async () => {
    sessionStore.set(LIVE_SESSION as never);
    authApiMock.refresh.mockRejectedValueOnce(new Error('refresh cookie expired'));
    await sessionManager.recoverSession();

    const bootstrap = getRouteBootstrapState('/groups', sessionStore.get());

    expect(bootstrap.shouldRedirectToLogin).toBe(true);
    expect(bootstrap.shouldRedirectToForbidden).toBe(false);
  });

  it('сессию удалось обновить — человек остаётся на месте, работа продолжается', async () => {
    sessionStore.set(LIVE_SESSION as never);
    authApiMock.refresh.mockResolvedValueOnce({
      accessToken: 'token_fresh',
      refreshToken: 'r2',
      sessionId: 's1'
    });
    authApiMock.me.mockResolvedValue({
      id: 'u_admin',
      tenantId: 'tenant_demo',
      login: 'admin',
      email: null,
      status: 'active',
      displayName: 'Администратор центра',
      permissions: ['groups.read']
    });
    authApiMock.userRoles.mockResolvedValue([{ code: 'tenant_admin' }]);

    const token = await sessionManager.recoverSession();

    expect(token).toBe('token_fresh');
    expect(getRouteBootstrapState('/groups', sessionStore.get()).shouldRedirectToLogin).toBe(false);
  });
  /*
   * Провод между клиентом и слоем сессии — самое хрупкое место этой правки: он ставится
   * побочным действием при загрузке модуля (`setSessionRecovery` в конце
   * `lib/auth/session-manager.ts`). Убери строку — и всё вернётся к прежнему: 401 будет
   * просто ошибкой на экране. Поэтому проверяется не наличие строки, а её последствие.
   */
  it('клиент и слой сессии соединены: 401 сам просит обновить сессию', async () => {
    sessionStore.set(LIVE_SESSION as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'auth_required', message: 'Access token is invalid or expired' },
          meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-01-01T00:00:00.000Z' }
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    );
    authApiMock.refresh.mockRejectedValueOnce(new Error('refresh cookie expired'));

    const { apiRequest } = await import('../lib/api/client');
    await expect(
      apiRequest('/groups', { auth: { accessToken: 'token_stale' } } as never)
    ).rejects.toThrow();

    // Обновление запрошено — значит, точка восстановления стоит.
    expect(authApiMock.refresh).toHaveBeenCalledTimes(1);
    // Обновить не удалось — сессия стёрта, и экран уводит на вход.
    expect(getRouteBootstrapState('/groups', sessionStore.get()).shouldRedirectToLogin).toBe(true);
    vi.unstubAllGlobals();
  });
  /*
   * Третий провод — от хранилища к состоянию React — тестом не проверить: в наборе нет
   * React Testing Library (CLAUDE.md), а без монтирования `AuthProvider` подписки не
   * существует. Поэтому здесь единственная в этом файле проверка ПО ТЕКСТУ, и она честно
   * названа: без этой строки конец сессии останется невидимым для экрана, а два теста выше
   * будут по-прежнему зелёными — они проверяют слой ниже.
   */
  it('контекст входа подписан на хранилище сессии', () => {
    const context = readFileSync(join(APP_ROOT, 'src', 'features', 'auth', 'context.tsx'), 'utf8');
    expect(context).toContain('sessionStore.subscribe(setSession)');
  });
});
