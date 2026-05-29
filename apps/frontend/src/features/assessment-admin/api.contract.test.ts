import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { assessmentAdminApi as Api } from './api';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 3 Plan A — frontend contract tests: envelope unwrap + URL/method/body
 * assertions для assessmentAdminApi. Покрытие — по 1+ кейсу на endpoint group.
 */

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active'
  },
  tokens: { accessToken: 'tk', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['assessment.question_banks.write', 'assessment.tests.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-05-30T00:00:00.000Z' }
  });

describe('assessmentAdminApi envelope compatibility (Phase 3 Plan A Task 8)', () => {
  let api: typeof Api;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const m = await import('./api');
    api = m.assessmentAdminApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  // ---------- question banks ----------
  it('questionBanks.list — GET /question-banks with filters → unwraps envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    );
    await api.questionBanks.list(session, { q: 'sec', status: 'draft', page: 2, pageSize: 25 });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(u);
    expect(url.pathname).toContain('/question-banks');
    expect(url.searchParams.get('q')).toBe('sec');
    expect(url.searchParams.get('status')).toBe('draft');
    expect(url.searchParams.get('page_size')).toBe('25');
    expect(init.method).toBe('GET');
  });

  it('questionBanks.get — GET /question-banks/:id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'qb_1', tenantId: 'tenant_demo' }), { status: 200 })
    );
    const result = await api.questionBanks.get(session, 'qb_1');
    expect(result.id).toBe('qb_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/question-banks\/qb_1$/);
    expect(init.method).toBe('GET');
  });

  it('questionBanks.create — POST /question-banks with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'qb_new', title: 'Bank' }), { status: 201 })
    );
    await api.questionBanks.create(session, { title: 'Bank', description: 'd' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/question-banks$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Bank', description: 'd' });
  });

  it('questionBanks.archive — POST /question-banks/:id/archive', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'qb_1', status: 'archived' }), { status: 200 })
    );
    await api.questionBanks.archive(session, 'qb_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/question-banks\/qb_1\/archive$/);
    expect(init.method).toBe('POST');
  });

  // ---------- questions ----------
  it('questions.listForBank — GET /question-banks/:bankId/questions with filters', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    );
    await api.questions.listForBank(session, 'qb_1', { type: 'essay', tag: 'safety' });
    const [u] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(u);
    expect(url.pathname).toMatch(/\/question-banks\/qb_1\/questions$/);
    expect(url.searchParams.get('type')).toBe('essay');
    expect(url.searchParams.get('tag')).toBe('safety');
  });

  it('questions.create — POST /questions with type-aware payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'q1', type: 'number_input' }), { status: 201 })
    );
    await api.questions.create(session, {
      questionBankId: 'qb_1',
      type: 'number_input',
      score: 1,
      numericExpected: 42,
      numericTolerance: 0.1
    });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/questions$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.type).toBe('number_input');
    expect(body.numericExpected).toBe(42);
  });

  it('questions.update — PATCH /questions/:id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'q1', title: 'New' }), { status: 200 })
    );
    await api.questions.update(session, 'q1', { title: 'New' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/questions\/q1$/);
    expect(init.method).toBe('PATCH');
  });

  // ---------- tests ----------
  it('tests.list — GET /tests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    );
    await api.tests.list(session, {});
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests$/);
    expect(init.method).toBe('GET');
  });

  it('tests.create — POST /tests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 't1', title: 'T' }), { status: 201 })
    );
    await api.tests.create(session, { courseId: 'c1', title: 'T' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests$/);
    expect(init.method).toBe('POST');
  });

  it('tests.publish — POST /tests/:id/publish', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 't1', status: 'published' }), { status: 200 })
    );
    await api.tests.publish(session, 't1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests\/t1\/publish$/);
    expect(init.method).toBe('POST');
  });

  it('tests.upsertRule — PUT /tests/:id/rules (Phase 3 new endpoint)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 't1', rules: { attemptLimit: 3 } }), { status: 200 })
    );
    await api.tests.upsertRule(session, 't1', { attemptLimit: 3, passingScore: 0.7 });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests\/t1\/rules$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body)).attemptLimit).toBe(3);
  });

  it('tests.addQuestion — POST /tests/:id/questions/single (Phase 3 new endpoint)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'tq1', questionId: 'q1' }), { status: 201 })
    );
    await api.tests.addQuestion(session, 't1', { questionId: 'q1', sortOrder: 5 });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests\/t1\/questions\/single$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ questionId: 'q1', sortOrder: 5 });
  });

  it('tests.removeQuestion — DELETE /tests/:id/questions/:questionId (Phase 3 new endpoint)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope({ removed: true }), { status: 200 }));
    await api.tests.removeQuestion(session, 't1', 'q1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests\/t1\/questions\/q1$/);
    expect(init.method).toBe('DELETE');
  });

  it('tests.reorderQuestion — PATCH /tests/:id/questions/:questionId (Phase 3 new endpoint)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'tq1', sortOrder: 3 }), { status: 200 })
    );
    await api.tests.reorderQuestion(session, 't1', 'q1', 3);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/tests\/t1\/questions\/q1$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ sortOrder: 3 });
  });

  // ---------- assignments ----------
  it('assignments.list — GET /assignments', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    );
    await api.assignments.list(session, {});
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignments$/);
    expect(init.method).toBe('GET');
  });

  it('assignments.create — POST /assignments', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'a1', title: 'Asn' }), { status: 201 })
    );
    await api.assignments.create(session, { courseId: 'c1', title: 'Asn', maxScore: 100 });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignments$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).maxScore).toBe(100);
  });

  it('assignments.update — PATCH /assignments/:id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'a1', title: 'New' }), { status: 200 })
    );
    await api.assignments.update(session, 'a1', { title: 'New' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignments\/a1$/);
    expect(init.method).toBe('PATCH');
  });

  // ---------- reviewer queue ----------
  it('reviewerQueue.get — GET /reviewer/queue (Phase 3 new endpoint)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ pendingAttempts: [], pendingSubmissions: [] }), { status: 200 })
    );
    const r = await api.reviewerQueue.get(session);
    expect(r.pendingAttempts).toEqual([]);
    expect(r.pendingSubmissions).toEqual([]);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/reviewer\/queue$/);
    expect(init.method).toBe('GET');
  });
});
