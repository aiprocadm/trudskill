import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { consentsApi as ConsentsApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: 'learner@example.com',
    displayName: 'Слушатель',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['learner'],
  permissions: ['identity.submit']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const state = (kind: 'personal_data' | 'photo', granted: boolean) => ({
  kind,
  granted,
  renewalRecommended: false,
  hasDocument: true
});

/** ФТ-C3.2 (Фаза 3 Task 6): раздельные согласия на ПДн и на фото. */
describe('consentsApi envelope compatibility', () => {
  let consentsApi: typeof ConsentsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    consentsApi = (await import('./api')).consentsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('me: GET /consents/me отдаёт два независимых состояния', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          learnerId: 'learner_1',
          personalData: state('personal_data', true),
          photo: state('photo', false)
        }),
        { status: 200 }
      )
    );

    const result = await consentsApi.me(session);
    expect(result.personalData.granted).toBe(true);
    expect(result.photo.granted).toBe(false);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/consents/me');
    expect(init.method).toBe('GET');
  });

  it('grant: POST /consents/me/photo/grant — адрес зависит от вида согласия', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'cfact_1', kind: 'photo' }), { status: 201 })
    );

    await consentsApi.grant(session, 'photo');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/consents/me/photo/grant');
    expect(init.method).toBe('POST');
  });

  it('revoke: отзывается ровно указанный вид, второй в запрос не попадает', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope(state('photo', false)), { status: 200 })
    );

    const result = await consentsApi.revoke(session, 'photo');
    expect(result.granted).toBe(false);

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/consents/me/photo/revoke');
    expect(calledUrl).not.toContain('personal_data');
  });

  it('documents: тексты обоих согласий могут отсутствовать', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ personal_data: null, photo: null }), { status: 200 })
    );

    const result = await consentsApi.documents(session);
    expect(result.personal_data).toBeNull();
    expect(result.photo).toBeNull();
  });
});
