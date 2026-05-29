import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { testPlayerApi as Api } from './api';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 3 Plan B — frontend contract tests for the learner test player:
 * envelope unwrap + URL/method/body assertions. One case per endpoint.
 */

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: 'learner@example.com',
    displayName: 'Learner',
    status: 'active'
  },
  tokens: { accessToken: 'tk', sessionId: 's1', expiresIn: 300 },
  roles: ['learner'],
  permissions: ['assessment.tests.read', 'assessment.attempts.take']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-05-30T00:00:00.000Z' }
  });

describe('testPlayerApi envelope compatibility (Phase 3 Plan B Task 8)', () => {
  let api: typeof Api;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const m = await import('./api');
    api = m.testPlayerApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('myTests — GET /me/tests with NO learnerId query param (server resolves actor)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));
    const result = await api.myTests(session);
    expect(result).toEqual([]);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(u);
    expect(url.pathname).toMatch(/\/me\/tests$/);
    expect(url.search).toBe('');
    expect(init.method).toBe('GET');
  });

  it('startAttempt — POST /attempts/start with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'at_1', testId: 't1' }), { status: 201 })
    );
    const payload = { testId: 't1', enrollmentId: 'e1', learnerId: 'l1' };
    const result = await api.startAttempt(session, payload);
    expect(result.id).toBe('at_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/start$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  it('getAttempt — GET /attempts/:id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'at_1', maxScore: 5 }), { status: 200 })
    );
    const result = await api.getAttempt(session, 'at_1');
    expect(result.id).toBe('at_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/at_1$/);
    expect(init.method).toBe('GET');
  });

  it('getAttemptQuestions — GET /attempts/:id/questions', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));
    await api.getAttemptQuestions(session, 'at_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/at_1\/questions$/);
    expect(init.method).toBe('GET');
  });

  it('saveAnswer — POST /attempts/:id/answers with payload', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope({ ok: true }), { status: 200 }));
    const payload = { questionId: 'q1', selectedOptionIds: ['o1'] };
    await api.saveAnswer(session, 'at_1', payload);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/at_1\/answers$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  it('submitAttempt — POST /attempts/:id/submit', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'at_1', passed: true }), { status: 200 })
    );
    const result = await api.submitAttempt(session, 'at_1');
    expect(result.id).toBe('at_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/at_1\/submit$/);
    expect(init.method).toBe('POST');
  });

  it('getAttemptResult — GET /attempts/:id/result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'r_1', passed: false, maxScore: 5, attemptsCount: 1 }), {
        status: 200
      })
    );
    const result = await api.getAttemptResult(session, 'at_1');
    expect(result.passed).toBe(false);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/at_1\/result$/);
    expect(init.method).toBe('GET');
  });
});
