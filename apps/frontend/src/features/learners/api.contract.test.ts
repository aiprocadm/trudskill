import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { learnersApi as LearnersApi } from './api';
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
  permissions: ['learners.read', 'learners.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('learnersApi envelope compatibility', () => {
  let learnersApi: typeof LearnersApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    learnersApi = importedModule.learnersApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list unwraps response from envelope and builds correct URL with all filters', async () => {
    const responseData = {
      items: [
        {
          id: 'l_1',
          tenantId: 'tenant_demo',
          firstName: 'Иван',
          lastName: 'Иванов',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      total: 1,
      page: 2,
      pageSize: 10
    };

    fetchMock.mockResolvedValueOnce(new Response(envelope(responseData), { status: 200 }));

    const result = await learnersApi.list(session, {
      q: 'иванов',
      status: 'active',
      page: 2,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('l_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.pathname).toContain('/learners');
    expect(url.searchParams.get('q')).toBe('иванов');
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('10');
    expect(init.method).toBe('GET');
  });

  it('list builds URL with no query params when filters are empty', async () => {
    const responseData = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20
    };

    fetchMock.mockResolvedValueOnce(new Response(envelope(responseData), { status: 200 }));

    await learnersApi.list(session, {});

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.searchParams.toString()).toBe('');
    expect(url.pathname).toContain('/learners');
  });

  it('updateProfile sends PATCH to /learners/:id/profile with payload in body and unwraps response', async () => {
    const learnerId = 'l_abc';
    const updatedLearner = {
      id: learnerId,
      tenantId: 'tenant_demo',
      firstName: 'Пётр',
      lastName: 'Петров',
      position: 'Инженер',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z'
    };

    fetchMock.mockResolvedValueOnce(new Response(envelope(updatedLearner), { status: 200 }));

    const payload = {
      firstName: 'Пётр',
      lastName: 'Петров',
      position: 'Инженер'
    };

    const result = await learnersApi.updateProfile(session, learnerId, payload);

    expect(result.id).toBe(learnerId);
    expect(result.firstName).toBe('Пётр');
    expect(result.position).toBe('Инженер');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(`/learners/${learnerId}/profile`);
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as {
      firstName: string;
      lastName: string;
      position: string;
    };
    expect(body.firstName).toBe('Пётр');
    expect(body.lastName).toBe('Петров');
    expect(body.position).toBe('Инженер');
  });

  // === ФТ-G6 (Фаза 4 Task 12): права субъекта персональных данных ===

  it('revealPii шлёт причину на /pii/reveal и читает раскрытое из конверта (МГ-C1.1)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ snils: '112-233-445 95', passport: { series: '4512', number: '123456' } }),
        {
          status: 201
        }
      )
    );
    const result = await learnersApi.revealPii(session, 'l1', 'заявка №12');
    expect(result.snils).toBe('112-233-445 95');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/learners/l1/pii/reveal');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ reason: 'заявка №12' });
  });

  it('exportPersonalData ходит GET на /personal-data и разворачивает конверт', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ subject: { learnerId: 'l_abc' } }), { status: 200 })
    );

    const result = (await learnersApi.exportPersonalData(session, 'l_abc')) as {
      subject: { learnerId: string };
    };

    expect(result.subject.learnerId).toBe('l_abc');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/learners/l_abc/personal-data');
    expect(init.method).toBe('GET');
  });

  it('erasePersonalData шлёт POST на /erasure — не DELETE: документы остаются', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          learnerId: 'l_abc',
          erasedFields: ['snils'],
          retained: [{ what: 'выданные документы: 2', reason: 'по закону' }],
          identityImagesPurged: 1
        }),
        { status: 200 }
      )
    );

    const report = await learnersApi.erasePersonalData(session, 'l_abc', 'заявление №7');

    expect(report.erasedFields).toEqual(['snils']);
    expect(report.retained[0]?.what).toContain('выданные документы');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/learners/l_abc/personal-data/erasure');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'заявление №7' });
  });
});
