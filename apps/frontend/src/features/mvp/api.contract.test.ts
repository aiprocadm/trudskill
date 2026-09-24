import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'demo',
    email: 'demo@example.com',
    displayName: 'Demo',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['users.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('mvp api envelope compatibility', () => {
  let mvpApi: {
    listUsers: (session: UserSession, query: { page: number }) => Promise<{ items: unknown[] }>;
    listCounterparties: (
      session: UserSession,
      query: { page: number }
    ) => Promise<{ items: Array<{ id: string }> }>;
    listTests: (
      session: UserSession,
      query: { page: number }
    ) => Promise<{ items: Array<{ id: string }> }>;
    getAttemptResult: (
      session: UserSession,
      attemptId: string
    ) => Promise<{ finalScore: number; maxScore: number; passed: boolean }>;
    listCommissions: (
      session: UserSession,
      status?: 'active' | 'archived'
    ) => Promise<{ items: Array<{ id: string; code: string }> }>;
    getCommission: (
      session: UserSession,
      id: string
    ) => Promise<{ id: string; members: Array<{ id: string }> }>;
    createCommission: (
      session: UserSession,
      payload: { code: string; name: string }
    ) => Promise<{ id: string; code: string }>;
    listPortalDocuments: (
      session: UserSession,
      query: { page: number }
    ) => Promise<{ items: Array<{ id: string; learnerName?: string }> }>;
    completeGroupWizard: (
      session: UserSession,
      payload: {
        idempotencyKey: string;
        group: { name: string };
        courses: Array<{ courseId: string }>;
        access: { mode: 'later' };
      }
    ) => Promise<{ group: { id: string }; enrollments: { failed: number } }>;
    nextGroupCode: (session: UserSession) => Promise<{ code: string }>;
    updateEnrollmentStatus: (
      session: UserSession,
      id: string,
      status: 'cancelled',
      reason?: string
    ) => Promise<{ id: string; status: string }>;
    markEnrollmentResult: (
      session: UserSession,
      id: string,
      payload: { resultCode: 'absent' | null }
    ) => Promise<{ id: string; resultCode?: string }>;
    listMyEnrollments: (session: UserSession) => Promise<{
      items: Array<{ id: string; courseId?: string; courseTitle?: string; status: string }>;
    }>;
  };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

    const importedModule = await import('./api');
    mvpApi = importedModule.mvpApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listUsers reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'u1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listUsers(session, { page: 1 });

    expect(result.items).toHaveLength(1);
  });

  // МГ-B2 (срез 8.5): мастер шлёт одно тело на /groups/wizard и читает сводку из конверта.
  it('completeGroupWizard шлёт POST /groups/wizard и читает сводку из конверта', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          idempotencyKey: 'k1',
          group: { id: 'g1' },
          coursesAssigned: 1,
          enrollments: { total: 1, created: 1, reused: 0, failed: 0, rows: [] },
          access: { mode: 'later', sent: 0, sheetFileId: null, deferred: true }
        }),
        { status: 201 }
      )
    );

    const result = await mvpApi.completeGroupWizard(session, {
      idempotencyKey: 'k1',
      group: { name: 'Группа' },
      courses: [{ courseId: 'c1' }],
      access: { mode: 'later' }
    });

    expect(result.group.id).toBe('g1');
    expect(result.enrollments.failed).toBe(0);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/groups/wizard');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      idempotencyKey: 'k1',
      courses: [{ courseId: 'c1' }]
    });
  });

  // МГ-B7.1: отчисление несёт причину в теле, неявка идёт отдельной ручкой результата.
  it('updateEnrollmentStatus шлёт причину, markEnrollmentResult — PATCH /enrollments/:id/result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'enr_1', status: 'cancelled' }), { status: 200 })
    );
    await mvpApi.updateEnrollmentStatus(session, 'enr_1', 'cancelled', 'уволен');
    const [statusUrl, statusInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(statusUrl)).toContain('/enrollments/enr_1/status');
    expect(JSON.parse(String((statusInit as RequestInit).body))).toEqual({
      status: 'cancelled',
      reason: 'уволен'
    });

    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'enr_1', resultCode: 'absent' }), { status: 200 })
    );
    const marked = await mvpApi.markEnrollmentResult(session, 'enr_1', { resultCode: 'absent' });
    expect(marked.resultCode).toBe('absent');
    const [resultUrl, resultInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(resultUrl)).toContain('/enrollments/enr_1/result');
    expect((resultInit as RequestInit).method).toBe('PATCH');
  });

  it('nextGroupCode читает код из конверта по /groups/next-code', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope({ code: '263901' }), { status: 200 }));

    const result = await mvpApi.nextGroupCode(session);

    expect(result.code).toBe('263901');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/groups/next-code');
  });

  it('listPortalDocuments reads data from envelope and hits /portal/documents', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          items: [{ id: 'doc1', learnerName: 'Иванов Иван' }],
          page: 1,
          pageSize: 20,
          total: 1
        }),
        { status: 200 }
      )
    );

    const result = await mvpApi.listPortalDocuments(session, { page: 1 });

    expect(result.items[0]?.id).toBe('doc1');
    expect(result.items[0]?.learnerName).toBe('Иванов Иван');
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('/portal/documents');
  });

  // Фаза 6 Task 1 (дефект D): кабинет обязан спрашивать «мои» зачисления у сервера,
  // а не фильтровать общий список по идентификатору IAM-пользователя — в зачислении
  // лежит идентификатор карточки слушателя, и совпадений не бывает никогда.
  it('listMyEnrollments ходит в /me/enrollments без query по learner_id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          items: [
            {
              id: 'enrollment_1',
              status: 'active',
              courseId: 'course_1',
              courseTitle: 'Охрана труда'
            }
          ]
        }),
        { status: 200 }
      )
    );

    const result = await mvpApi.listMyEnrollments(session);

    expect(result.items[0]?.id).toBe('enrollment_1');
    // Курс приходит с сервера: у зачисления своего courseId нет, он висит на группе.
    expect(result.items[0]?.courseId).toBe('course_1');
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('/me/enrollments');
    expect(requestedUrl).not.toContain('learner_id');
  });

  it('listCounterparties reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'c1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listCounterparties(session, { page: 1 });

    expect(result.items[0]?.id).toBe('c1');
  });

  it('listTests reads data from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 't1' }], page: 1, pageSize: 20, total: 1 }), {
        status: 200
      })
    );

    const result = await mvpApi.listTests(session, { page: 1 });

    expect(result.items[0]?.id).toBe('t1');
  });

  it('getAttemptResult reads result payload from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ finalScore: 88, maxScore: 100, passed: true }), { status: 200 })
    );

    const result = await mvpApi.getAttemptResult(session, 'att_1');

    expect(result.finalScore).toBe(88);
    expect(result.passed).toBe(true);
  });

  it('listCommissions appends status query when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [{ id: 'commission_1', code: 'OT_2026' }] }), { status: 200 })
    );

    const result = await mvpApi.listCommissions(session, 'active');

    expect(result.items[0]?.code).toBe('OT_2026');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/commissions?status=active');
  });

  it('getCommission unwraps members from envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'commission_1', members: [{ id: 'cm_1' }] }), { status: 200 })
    );

    const result = await mvpApi.getCommission(session, 'commission_1');

    expect(result.members[0]?.id).toBe('cm_1');
  });

  it('createCommission sends POST with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'commission_new', code: 'PA_1' }), { status: 201 })
    );

    const result = await mvpApi.createCommission(session, { code: 'PA_1', name: 'Test' });

    expect(result.id).toBe('commission_new');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'PA_1', name: 'Test' });
  });
});
