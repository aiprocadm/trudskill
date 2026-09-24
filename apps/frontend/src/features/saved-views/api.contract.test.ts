import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { savedViewsApi as SavedViewsApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['tenant.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

/** Сохранённые представления на сервере (МГ-H4.1, срез 11.3): форма ответа списка и адреса ручек. */
describe('savedViewsApi envelope compatibility', () => {
  let savedViewsApi: typeof SavedViewsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    savedViewsApi = importedModule.savedViewsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list: /saved-views?entity= — массив представлений с признаком «своё» и областью', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          {
            id: 'sv_1',
            entity: 'learners',
            name: 'Мои должники',
            scope: 'private',
            filters: { status: 'active', noEmail: '1' },
            columns: ['lastName', 'email'],
            own: true
          }
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const views = await savedViewsApi.list(session, 'learners');
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/saved-views?entity=learners');
    expect(views).toEqual([
      expect.objectContaining({ id: 'sv_1', name: 'Мои должники', scope: 'private', own: true })
    ]);
  });

  it('create и remove: свои — по корню, общие — по /shared', async () => {
    /* Тело ответа читается один раз — на каждый вызов свой объект. */
    fetchMock.mockImplementation(
      async () =>
        new Response(
          envelope({
            id: 'sv_2',
            entity: 'learners',
            name: 'x',
            scope: 'private',
            filters: {},
            columns: [],
            own: true
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    await savedViewsApi.create(session, { entity: 'learners', name: 'x', filters: {} });
    await savedViewsApi.createShared(session, { entity: 'learners', name: 'x', filters: {} });
    await savedViewsApi.remove(session, 'sv_2', false);
    await savedViewsApi.remove(session, 'sv_3', true);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/saved-views$/);
    expect(urls[1]).toMatch(/\/saved-views\/shared$/);
    expect(urls[2]).toMatch(/\/saved-views\/sv_2$/);
    expect(urls[3]).toMatch(/\/saved-views\/shared\/sv_3$/);
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('DELETE');
  });
});
