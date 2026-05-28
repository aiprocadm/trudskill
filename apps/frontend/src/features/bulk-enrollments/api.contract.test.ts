import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { bulkEnrollmentsApi as BulkApi } from './api';
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
  permissions: ['learners.write', 'enrollments.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('bulkEnrollmentsApi envelope compatibility', () => {
  let bulkEnrollmentsApi: typeof BulkApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    bulkEnrollmentsApi = importedModule.bulkEnrollmentsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('bulkImport unwraps outcome from envelope and posts payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          idempotencyKey: 'idem_1',
          groupId: 'grp_1',
          total: 1,
          created: 1,
          reused: 0,
          enrolled: 1,
          failed: 0,
          rows: [{ rowNumber: 2, status: 'created', learnerId: 'l_1', enrollmentId: 'e_1' }]
        }),
        { status: 201 }
      )
    );

    const result = await bulkEnrollmentsApi.bulkImport(session, {
      idempotencyKey: 'idem_1',
      groupId: 'grp_1',
      rows: [{ rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' }]
    });

    expect(result.created).toBe(1);
    expect(result.rows[0]?.status).toBe('created');
    expect(result.rows[0]?.learnerId).toBe('l_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/learners/bulk-import');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { idempotencyKey: string; rows: unknown[] };
    expect(body.idempotencyKey).toBe('idem_1');
    expect(body.rows).toHaveLength(1);
  });

  it('bulkImport throws ApiClientError on 403', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'permission_denied', message: 'Forbidden' },
          meta: { requestId: 'r-x', correlationId: 'c-x' }
        }),
        { status: 403 }
      )
    );

    await expect(
      bulkEnrollmentsApi.bulkImport(session, {
        idempotencyKey: 'k',
        groupId: 'g',
        rows: [{ rowNumber: 2, fullName: 'X Y', email: 'a@x.ru' }]
      })
    ).rejects.toThrow();
  });

  it('bulkImport throws ApiClientError on 400 validation error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'validation_error', message: 'Bad input' },
          meta: { requestId: 'r-x', correlationId: 'c-x' }
        }),
        { status: 400 }
      )
    );

    await expect(
      bulkEnrollmentsApi.bulkImport(session, {
        idempotencyKey: 'k',
        groupId: 'g',
        rows: [{ rowNumber: 2, fullName: '', email: '' }]
      })
    ).rejects.toThrow();
  });
});
