import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { lookupApi as LookupApi } from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Справочники личного дела (МГ-C1.2): адреса ручек и разворот конверта. */
describe('lookup api contract', () => {
  const fetchMock = vi.fn();
  let lookupApi: typeof LookupApi;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-09-24T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    lookupApi = (await import('./api')).lookupApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('подсказки должностей идут с q в адресе, без q — весь список', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ items: [{ id: 'p1', name: 'Инженер' }] }));
    const result = await lookupApi.positions(session, ' инж ');
    expect(result.items[0]?.name).toBe('Инженер');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/lookup/positions?q=%D0%B8%D0%BD%D0%B6'
    );
    fetchMock.mockResolvedValueOnce(envelope({ items: [] }));
    await lookupApi.positions(session, '');
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/lookup\/positions$/);
  });

  it('уровни образования и страны — GET по своим адресам', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ items: [{ code: 'other', name: 'Иное' }] }));
    expect((await lookupApi.educationLevels(session)).items[0]?.code).toBe('other');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/lookup/education-levels');
    fetchMock.mockResolvedValueOnce(envelope({ items: [{ code: 'RU', name: 'Россия' }] }));
    expect((await lookupApi.countries(session)).items[0]?.name).toBe('Россия');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/lookup/countries');
  });
});
