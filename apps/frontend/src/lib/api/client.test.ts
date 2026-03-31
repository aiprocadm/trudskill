import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

const successEnvelope = <T>(data: T) => ({
  data,
  meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
});

describe('api client envelope contract', () => {
  let apiRequest: <T>(path: string) => Promise<T>;
  let apiRequestEnvelope: <T>(path: string) => Promise<{ data: T; meta: { requestId: string } }>;
  let ApiClientError: new (...args: unknown[]) => Error;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const client = await import('./client');
    apiRequest = client.apiRequest;
    apiRequestEnvelope = client.apiRequestEnvelope;
    ApiClientError = client.ApiClientError;
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
      new Response(JSON.stringify(successEnvelope({ id: 'u1' })), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    const payload = await apiRequest<{ id: string }>('/auth/me');

    expect(payload).toEqual({ id: 'u1' });
  });

  it('returns full envelope in apiRequestEnvelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(successEnvelope({ items: [1, 2] })), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    const envelope = await apiRequestEnvelope<{ items: number[] }>('/users');

    expect(envelope.meta.requestId).toBe('req-1');
    expect(envelope.data.items).toEqual([1, 2]);
  });

  it('fails on invalid response format without envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'u1' }), { status: 200 }));

    await expect(apiRequest<{ id: string }>('/auth/me')).rejects.toBeInstanceOf(ApiClientError);
  });
});
