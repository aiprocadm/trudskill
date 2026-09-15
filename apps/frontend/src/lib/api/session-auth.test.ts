import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ClientModule from './client';

/**
 * Запрос без явного токена уходит ПОДПИСАННЫМ (ТЗ «Стабилизация, UX и развитие», 2.3 / Б5).
 *
 * Здесь проверяется поведение, а не текст исходника: что реально уехало в заголовках. Раньше
 * `apiRequest('/webinars')` уходил без единого признака вошедшего, сервер отвечал
 * `auth_required`, и человек читал «Вход не выполнен» — сидя в системе.
 */

const fetchMock = vi.fn();

const envelope = <T>(data: T) => ({
  data,
  meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
});

const okResponse = () =>
  new Response(JSON.stringify(envelope({ ok: true })), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

const headersOfLastCall = (): Headers => new Headers(fetchMock.mock.calls.at(-1)![1].headers);

/* Модуль загружается лениво: переменные окружения обязаны встать ДО его первого разбора. */
type ApiClientModule = typeof ClientModule;

describe('подпись вошедшего доезжает сама (ТЗ 2.3)', () => {
  let client: ApiClientModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    client = await import('./client');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    client.setSessionAuth(null);
    client.setSessionRecovery(null);
  });

  it('вызов, который токен не передал, всё равно подписан', async () => {
    client.setSessionAuth(() => ({
      accessToken: 'token_live',
      tenantId: 'tenant_alpha',
      userId: 'u1'
    }));
    fetchMock.mockResolvedValueOnce(okResponse());

    await client.apiRequest('/webinars/provider-settings');

    const headers = headersOfLastCall();
    expect(headers.get('authorization'), 'без этого сервер ответит «вход не выполнен»').toBe(
      'Bearer token_live'
    );
    expect(headers.get('x-tenant-id'), 'центр обязателен: охрана сверяет его с токеном').toBe(
      'tenant_alpha'
    );
  });

  it('заданную вызывающим подпись не перетирает', async () => {
    client.setSessionAuth(() => ({ accessToken: 'token_live', tenantId: 'tenant_alpha' }));
    fetchMock.mockResolvedValueOnce(okResponse());

    await client.apiRequest('/auth/2fa/status', { auth: { accessToken: 'token_own' } });

    expect(headersOfLastCall().get('authorization')).toBe('Bearer token_own');
  });

  it('заведомо анонимный запрос не подписывается даже при живой сессии', async () => {
    client.setSessionAuth(() => ({ accessToken: 'token_live', tenantId: 'tenant_alpha' }));
    fetchMock.mockResolvedValueOnce(okResponse());

    await client.apiRequest('/public/tenants/by-code/alpha', { anonymous: true });

    expect(headersOfLastCall().get('authorization')).toBeNull();
  });

  it('не вошёл — подписи нет, и это не ошибка', async () => {
    client.setSessionAuth(() => null);
    fetchMock.mockResolvedValueOnce(okResponse());

    await client.apiRequest('/public/verify/abc');

    expect(headersOfLastCall().get('authorization')).toBeNull();
  });

  it('401 на таком запросе ТЕПЕРЬ чинится обновлением сессии', async () => {
    /*
     * Главное последствие. Раньше восстановление включалось только когда токен передали явно —
     * то есть ровно там, где он и так был. Запросы без подписи оно не спасало никогда, и F5
     * оставался единственным способом починить экран.
     */
    client.setSessionAuth(() => ({ accessToken: 'token_stale', tenantId: 'tenant_alpha' }));
    client.setSessionRecovery(async () => 'token_fresh');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'auth_required', message: 'no' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    fetchMock.mockResolvedValueOnce(okResponse());

    await client.apiRequest('/integrations/providers');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOfLastCall().get('authorization')).toBe('Bearer token_fresh');
  });
});
