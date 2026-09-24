import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { clientPeopleApi as ClientPeopleApi } from './people-api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: 'curator@example.com',
    displayName: 'Куратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['curator'],
  permissions: ['counterparties.read', 'counterparties.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('clientPeopleApi (МГ-D2.1, срез 14.2)', () => {
  let api: typeof ClientPeopleApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = (await import('./people-api')).clientPeopleApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listContacts разворачивает конверт { items }', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          items: [
            {
              id: 'cc_1',
              counterpartyId: 'cp_1',
              firstName: 'Анна',
              isPrimary: true,
              status: 'active'
            }
          ]
        }),
        { status: 200 }
      )
    );
    const result = await api.listContacts(session, 'cp_1');
    expect(result.items.map((c) => c.firstName)).toEqual(['Анна']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/counterparties/cp_1/contacts');
    expect(init.method).toBe('GET');
  });

  it('listEmployees передаёт поиск, статус и страницу серверу', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 2, pageSize: 25 }), { status: 200 })
    );
    const page = await api.listEmployees(session, 'cp_1', {
      q: 'ива',
      status: 'active',
      page: 2,
      pageSize: 25
    });
    expect(page).toEqual({ items: [], total: 0, page: 2, pageSize: 25 });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/counterparties/cp_1/employees?');
    expect(url).toContain('q=%D0%B8%D0%B2%D0%B0');
    expect(url).toContain('status=active');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=25');
  });

  it('bulkEmployees отправляет строки и отдаёт итог по строкам', async () => {
    const outcome = {
      total: 2,
      created: 1,
      skipped: 0,
      failed: 1,
      rows: [
        { rowNumber: 1, status: 'created', employeeId: 'ce_1', fullName: 'Иванов Иван' },
        { rowNumber: 2, status: 'failed', reason: 'Нужны фамилия и имя.' }
      ]
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(outcome), { status: 200 }));
    const result = await api.bulkEmployees(session, 'cp_1', [
      { lastName: 'Иванов', firstName: 'Иван' },
      { lastName: 'Кузнецов' }
    ]);
    expect(result).toEqual(outcome);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/counterparties/cp_1/employees/bulk');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      rows: [{ lastName: 'Иванов', firstName: 'Иван' }, { lastName: 'Кузнецов' }]
    });
  });

  it('updateEmployee и updateContact шлют PATCH по своим адресам', async () => {
    fetchMock.mockImplementation(async () => new Response(envelope({ id: 'x' }), { status: 200 }));
    await api.updateEmployee(session, 'cp_1', 'ce_1', { status: 'dismissed' });
    await api.updateContact(session, 'cp_1', 'cc_1', { isPrimary: true });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toContain('/counterparties/cp_1/employees/ce_1');
    expect(calls[0]?.[1].method).toBe('PATCH');
    expect(calls[1]?.[0]).toContain('/counterparties/cp_1/contacts/cc_1');
  });
});
