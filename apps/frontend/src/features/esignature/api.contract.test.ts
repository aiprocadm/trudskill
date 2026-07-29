import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { esignatureApi as EsignatureApi } from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Соглашение об электронном взаимодействии (ФТ-C1.1, Фаза 3 Task 3). */
describe('esignature api contract', () => {
  const fetchMock = vi.fn();
  let esignatureApi: typeof EsignatureApi;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-28T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    esignatureApi = (await import('./api')).esignatureApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('status говорит, нужно ли показать экран принятия', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ hasAgreement: true, agreementVersion: 2, acceptanceRequired: true })
    );

    const status = await esignatureApi.status(session);

    expect(status.acceptanceRequired).toBe(true);
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/esignature/status');
  });

  it('accept — POST без тела: подписывает тот текст, что показан', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ agreementVersion: 2, acceptedAt: '2026-07-28T10:00:00.000Z' })
    );

    await esignatureApi.accept(session);

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/esignature/accept');
    expect(init.method).toBe('POST');
  });

  it('отсутствующее соглашение приходит пустым, а не ошибкой', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ body: null, version: null }));

    const agreement = await esignatureApi.agreement(session);

    expect(agreement.body).toBeNull();
  });

  it('отказ прав при правке текста доходит сообщением', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'forbidden', message: 'Недостаточно прав' }, meta: {} }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(esignatureApi.saveAgreement(session, 'x'.repeat(30))).rejects.toThrow(/прав/);
  });
});
