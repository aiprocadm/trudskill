import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { recertificationApi as RecertApi } from './api';
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
  permissions: ['recertification.read', 'recertification.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('recertificationApi envelope compatibility (Phase 5C)', () => {
  let recertificationApi: typeof RecertApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    recertificationApi = (await import('./api')).recertificationApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list unwraps array envelope and sets status query', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          {
            id: 'd1',
            tenantId: 'tenant_demo',
            learnerId: 'l1',
            sourceDocumentId: 'gd1',
            courseVersionId: 'cv1',
            validUntil: '2026-08-01',
            status: 'pending',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            learnerName: 'Иванов Иван',
            courseTitle: 'Охрана труда'
          }
        ]),
        { status: 200 }
      )
    );

    const result = await recertificationApi.list(session, 'pending');

    expect(result).toHaveLength(1);
    expect(result[0]?.learnerName).toBe('Иванов Иван');
    expect(result[0]?.courseTitle).toBe('Охрана труда');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.pathname).toContain('/recertification-drafts');
    expect(url.searchParams.get('status')).toBe('pending');
    expect(init.method).toBe('GET');
  });

  it('list omits status query when undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));

    await recertificationApi.list(session);

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).searchParams.toString()).toBe('');
  });

  it('reject POSTs /recertification-drafts/:id/reject with reason body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'd1',
          tenantId: 'tenant_demo',
          learnerId: 'l1',
          sourceDocumentId: 'gd1',
          courseVersionId: 'cv1',
          validUntil: '2026-08-01',
          status: 'rejected',
          reason: 'не требуется',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await recertificationApi.reject(session, 'd1', 'не требуется');
    expect(result.status).toBe('rejected');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/recertification-drafts/d1/reject');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { reason?: string };
    expect(body.reason).toBe('не требуется');
  });

  it('reject sends empty body when no reason', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'd1',
          tenantId: 'tenant_demo',
          learnerId: 'l1',
          sourceDocumentId: 'gd1',
          courseVersionId: 'cv1',
          validUntil: '2026-08-01',
          status: 'rejected',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    await recertificationApi.reject(session, 'd1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({});
  });

  it('approve POSTs /recertification-drafts/:id/approve with targetGroupId body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'd1',
          tenantId: 'tenant_demo',
          learnerId: 'l1',
          sourceDocumentId: 'gd1',
          courseVersionId: 'cv1',
          validUntil: '2026-08-01',
          status: 'approved',
          resultingEnrollmentId: 'e1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 201 }
      )
    );

    const result = await recertificationApi.approve(session, 'd1', 'g_new');
    expect(result.status).toBe('approved');
    expect(result.resultingEnrollmentId).toBe('e1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/recertification-drafts/d1/approve');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { targetGroupId?: string };
    expect(body.targetGroupId).toBe('g_new');
  });

  it('scan POSTs /recertification/scan and unwraps summary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ draftsCreated: 2, emailsDispatched: 3 }), { status: 200 })
    );

    const result = await recertificationApi.scan(session);
    expect(result.draftsCreated).toBe(2);
    expect(result.emailsDispatched).toBe(3);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/recertification/scan');
    expect(init.method).toBe('POST');
  });
});
