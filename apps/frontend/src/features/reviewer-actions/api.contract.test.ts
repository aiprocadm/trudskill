import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { reviewerActionsApi as Api } from './api';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 3 Plan C — frontend contract tests: envelope unwrap + URL/method/body
 * assertions for reviewerActionsApi.
 */

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u_reviewer',
    tenantId: 'tenant_demo',
    login: 'reviewer',
    email: 'reviewer@example.com',
    displayName: 'Reviewer',
    status: 'active'
  },
  tokens: { accessToken: 'tk', sessionId: 's1', expiresIn: 300 },
  roles: ['teacher'],
  permissions: ['assessment.reviews.review', 'assessment.assignments.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-05-31T00:00:00.000Z' }
  });

describe('reviewerActionsApi envelope compatibility (Phase 3 Plan C Task 11)', () => {
  let api: typeof Api;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const m = await import('./api');
    api = m.reviewerActionsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('queue — GET /reviewer/queue → unwraps envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ pendingAttempts: [], pendingSubmissions: [] }), { status: 200 })
    );
    const result = await api.queue(session);
    expect(result.pendingAttempts).toEqual([]);
    expect(result.pendingSubmissions).toEqual([]);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/reviewer\/queue$/);
    expect(init.method).toBe('GET');
  });

  it('queue — submission items carry antivirusStatus + fileId through the envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          pendingAttempts: [],
          pendingSubmissions: [
            {
              kind: 'submission',
              id: 'sub_1',
              tenantId: 'tenant_demo',
              learnerId: 'l1',
              assignmentId: 'a1',
              submittedAt: '2026-05-31T00:00:00.000Z',
              fileId: 'file_1',
              antivirusStatus: 'infected'
            }
          ]
        }),
        { status: 200 }
      )
    );
    const result = await api.queue(session);
    expect(result.pendingSubmissions[0]?.antivirusStatus).toBe('infected');
    expect(result.pendingSubmissions[0]?.fileId).toBe('file_1');
  });

  it('takeIntoReview — POST /assignment-reviews with payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ id: 'rev_1', submissionId: 'sub_1', assignmentId: 'a1', status: 'in_review' }),
        { status: 201 }
      )
    );
    const result = await api.takeIntoReview(session, { submissionId: 'sub_1' });
    expect(result.status).toBe('in_review');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-reviews$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ submissionId: 'sub_1' });
  });

  it('completeReview — POST /assignment-reviews/:id/complete', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ id: 'rev_1', submissionId: 'sub_1', assignmentId: 'a1', status: 'completed' }),
        { status: 200 }
      )
    );
    await api.completeReview(session, 'rev_1', { score: 8, comment: 'good work' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-reviews\/rev_1\/complete$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ score: 8, comment: 'good work' });
  });

  it('returnSubmission — POST /assignment-submissions/:id/return', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'sub_1', status: 'returned' }), { status: 200 })
    );
    await api.returnSubmission(session, 'sub_1', { comment: 'needs revision' });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1\/return$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ comment: 'needs revision' });
  });

  it('completeAttemptReview — POST /attempts/:id/complete-review with answerScores', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'att_1', status: 'finished', score: 4 }), { status: 200 })
    );
    await api.completeAttemptReview(session, 'att_1', {
      answerScores: [{ questionId: 'q1', score: 4 }],
      reviewComment: 'well done'
    });
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/attempts\/att_1\/complete-review$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.answerScores).toEqual([{ questionId: 'q1', score: 4 }]);
    expect(body.reviewComment).toBe('well done');
  });

  it('submissionFileUrl — GET /assignment-submissions/:id/file-url', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ url: 'https://minio.local/GET-signed' }), { status: 200 })
    );
    const result = await api.submissionFileUrl(session, 'sub_1');
    expect(result.url).toBe('https://minio.local/GET-signed');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1\/file-url$/);
    expect(init.method).toBe('GET');
  });
});
