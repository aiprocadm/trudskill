import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

const successEnvelope = <T>(data: T) => ({
  data,
  meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
});

describe('api client envelope contract', () => {
  let apiRequest: <T>(path: string) => Promise<T>;
  let apiRequestEnvelope: <T>(path: string) => Promise<{ data: T; meta: { requestId: string } }>;
  let apiClient: {
    get: <T>(path: string) => Promise<T>;
    post: <T>(path: string, body?: unknown) => Promise<T>;
  };
  let ApiClientError: typeof Error;
  let setSessionRecovery: (recover: (() => Promise<string | null>) | null) => void;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const client = await import('./client');
    apiRequest = client.apiRequest;
    apiRequestEnvelope = client.apiRequestEnvelope;
    apiClient = client.apiClient;
    ApiClientError = client.ApiClientError as unknown as typeof Error;
    setSessionRecovery = client.setSessionRecovery;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    setSessionRecovery(null);
  });

  it('unwraps envelope data in apiRequest', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ id: 'u1' })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const payload = await apiRequest<{ id: string }>('/auth/me');

    expect(payload).toEqual({ id: 'u1' });
  });

  it('returns full envelope in apiRequestEnvelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ items: [1, 2] })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const envelope = await apiRequestEnvelope<{ items: number[] }>('/users');

    expect(envelope.meta.requestId).toBe('req-1');
    expect(envelope.data.items).toEqual([1, 2]);
  });

  it('fails on invalid response format without envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'u1' }), { status: 200 }));

    await expect(apiRequest<{ id: string }>('/auth/me')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('supports apiClient.get helper', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ items: ['hubspot'] })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const payload = await apiClient.get<{ items: string[] }>('/integrations/providers');
    expect(payload.items).toEqual(['hubspot']);
  });

  it('supports apiClient.post helper', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ id: 'cred-1' })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const payload = await apiClient.post<{ id: string }>('/integrations/credentials', {
      name: 'prod'
    });
    expect(payload.id).toBe('cred-1');
  });

  /*
   * TXT-004: связка «словарь → класс ошибки». Экраны показывают `message`, поэтому здесь
   * решается, что увидит человек. Без этого теста легко вернуть `super(normalized.message)`
   * и молча откатить весь срез — словарь останется на месте, но перестанет применяться.
   */
  it('в message — объяснение по-русски, а не ответ сервера слово в слово', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'internal_error', message: 'Unexpected API error' },
          meta: { requestId: 'req_7', correlationId: 'c', timestamp: '2026-01-01T00:00:00.000Z' }
        }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    );

    const failure = (await apiClient.get('/integrations/providers').catch((e) => e)) as Error & {
      details: string;
      normalized: { message: string };
    };

    expect(failure.message).toMatch(/[А-Яа-яЁё]/);
    expect(failure.message).not.toContain('Unexpected API error');
    expect(failure.message).not.toContain('internal_error');

    // Технические данные не потеряны: они уезжают в спойлер «Подробности».
    expect(failure.details).toContain('internal_error');
    expect(failure.details).toContain('req_7');
    expect(failure.normalized.message).toBe('Unexpected API error');
  });
  /*
   * Ревизия 2026-09-06 (§5.424), журнал 350.
   *
   * Токен доступа живёт 15 минут (`ACCESS_TOKEN_TTL_SECONDS`, умолчание 900). Через 15 минут
   * работы каждый запрос начинал отвечать 401, и клиент не делал НИЧЕГО: ни обновления
   * сессии по cookie (а она живёт много дольше), ни перехода на экран входа. Человек читал
   * «Вход не выполнен или срок сессии истёк. Войдите заново», оставался на месте и получал
   * то же самое на каждое действие — пока не догадывался нажать F5, потому что перезагрузка
   * запускает восстановление сессии и всё чинит.
   *
   * Теперь у клиента есть одна точка восстановления: слой сессии ставит её сам
   * (`setSessionRecovery`), и клиент на 401 спрашивает — «есть чем починить?».
   */
  const unauthorized = () =>
    new Response(
      JSON.stringify({
        error: { code: 'auth_required', message: 'Access token is invalid or expired' },
        meta: {
          requestId: 'req-401',
          correlationId: 'corr-401',
          timestamp: '2026-01-01T00:00:00.000Z'
        }
      }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );

  it('на 401 обновляет сессию и повторяет запрос новым токеном', async () => {
    const recover = vi.fn().mockResolvedValue('token_fresh');
    setSessionRecovery(recover);
    fetchMock.mockResolvedValueOnce(unauthorized());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ id: 'g1' })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const data = await apiRequest<{ id: string }>('/groups', {
      auth: { accessToken: 'token_stale' }
    } as never);

    expect(data).toEqual({ id: 'g1' });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Headers;
    expect(retryHeaders.get('authorization')).toBe('Bearer token_fresh');
  });

  it('если чинить нечем — ошибка человеку, без второго запроса', async () => {
    const recover = vi.fn().mockResolvedValue(null);
    setSessionRecovery(recover);
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(
      apiRequest('/groups', { auth: { accessToken: 'token_stale' } } as never)
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('повтор ровно один — второй 401 не уходит на новый круг', async () => {
    const recover = vi.fn().mockResolvedValue('token_fresh');
    setSessionRecovery(recover);
    fetchMock.mockResolvedValueOnce(unauthorized());
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(
      apiRequest('/groups', { auth: { accessToken: 'token_stale' } } as never)
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('запрос без токена не трогает восстановление — это вход, а не работа', async () => {
    const recover = vi.fn();
    setSessionRecovery(recover);
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(apiRequest('/auth/login')).rejects.toBeInstanceOf(ApiClientError);
    expect(recover).not.toHaveBeenCalled();
  });
});
