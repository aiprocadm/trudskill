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

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const client = await import('./client');
    apiRequest = client.apiRequest;
    apiRequestEnvelope = client.apiRequestEnvelope;
    apiClient = client.apiClient;
    ApiClientError = client.ApiClientError as unknown as typeof Error;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
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
});
