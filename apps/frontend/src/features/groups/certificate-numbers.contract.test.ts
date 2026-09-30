import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as NumbersModule from './certificate-numbers';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: 'c@example.com',
    displayName: 'Куратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['curator'],
  permissions: ['documents.generate']
};

describe('«Номера удостоверений» (МГ-F3.2, срез 20.3b)', () => {
  let mod: typeof NumbersModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mod = await import('./certificate-numbers');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('PUT /groups/:id/certificate-numbers: пустые поля уходят как null — снять назначение', async () => {
    const outcome = { total: 1, updated: 1, failed: 0, rows: [] };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: outcome,
          meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-30T10:00:00.000Z' }
        }),
        { status: 200 }
      )
    );
    await expect(
      mod.certificateNumbersApi.assign(session, 'g1', [
        { enrollmentId: 'e1', number: ' 264501-1 ', series: '', rank: '3' }
      ])
    ).resolves.toEqual(outcome);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/groups\/g1\/certificate-numbers$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      rows: [{ enrollmentId: 'e1', number: '264501-1', series: null, rank: '3' }]
    });
  });

  it('«Заполнить по порядку»: растут последние цифры, нули и приставка сохраняются', () => {
    expect(mod.sequenceFrom('264501-1', 3)).toEqual(['264501-1', '264501-2', '264501-3']);
    expect(mod.sequenceFrom('УД-000137', 2)).toEqual(['УД-000137', 'УД-000138']);
    expect(mod.sequenceFrom('12/ОТ', 2)).toEqual(['12/ОТ', '13/ОТ']);
    expect(mod.sequenceFrom('без цифр', 2)).toEqual([]);
  });

  it('порядок — как в протоколе, отказы — поимённо', () => {
    expect(
      mod.protocolOrder([{ name: 'Яковлев Иван' }, { name: 'Абрамова Анна' }]).map((r) => r.name)
    ).toEqual(['Абрамова Анна', 'Яковлев Иван']);
    expect(
      mod.toBulkOutcome(
        {
          total: 2,
          updated: 1,
          failed: 1,
          rows: [
            { rowNumber: 1, enrollmentId: 'e1', status: 'updated' },
            {
              rowNumber: 2,
              enrollmentId: 'e2',
              status: 'failed',
              code: 'certificate_already_issued',
              message: 'Удостоверение уже выпущено'
            }
          ]
        },
        (id) => (id === 'e2' ? 'Яковлев Иван' : '—')
      )
    ).toEqual({
      total: 2,
      succeeded: 1,
      failures: [{ label: 'Яковлев Иван', reason: 'Удостоверение уже выпущено' }]
    });
  });
});
