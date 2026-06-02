import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { practicalSubmissionsApi as Api } from './api';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 3 Plan C — frontend contract tests for the practical-submissions feature:
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
  permissions: ['assessment.assignments.read', 'assessment.submissions.submit']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-05-31T00:00:00.000Z' }
  });

describe('practicalSubmissionsApi envelope compatibility (Phase 3 Plan C Task 9)', () => {
  let api: typeof Api;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const m = await import('./api');
    api = m.practicalSubmissionsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('myAssignments — GET /me/assignments with NO query params (server resolves actor)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));
    const result = await api.myAssignments(session);
    expect(result).toEqual([]);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(u);
    expect(url.pathname).toMatch(/\/me\/assignments$/);
    expect(url.search).toBe('');
    expect(init.method).toBe('GET');
  });

  it('createSubmission — POST /assignment-submissions with payload', async () => {
    const sub = {
      id: 'sub_1',
      assignmentId: 'a1',
      enrollmentId: 'e1',
      learnerId: 'l1',
      status: 'draft'
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(sub), { status: 201 }));
    const payload = {
      assignmentId: 'a1',
      enrollmentId: 'e1',
      learnerId: 'l1',
      answerText: 'My answer'
    };
    const result = await api.createSubmission(session, payload);
    expect(result.id).toBe('sub_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  it('getSubmission — GET /assignment-submissions/:id (carries antivirusStatus)', async () => {
    const sub = { id: 'sub_1', status: 'draft', fileId: 'file_1', antivirusStatus: 'infected' };
    fetchMock.mockResolvedValueOnce(new Response(envelope(sub), { status: 200 }));
    const result = await api.getSubmission(session, 'sub_1');
    expect(result.id).toBe('sub_1');
    expect(result.antivirusStatus).toBe('infected');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1$/);
    expect(init.method).toBe('GET');
  });

  it('updateSubmission — PATCH /assignment-submissions/:id with payload', async () => {
    const sub = { id: 'sub_1', status: 'draft', answerText: 'Updated' };
    fetchMock.mockResolvedValueOnce(new Response(envelope(sub), { status: 200 }));
    const payload = { answerText: 'Updated' };
    await api.updateSubmission(session, 'sub_1', payload);
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  it('submitSubmission — POST /assignment-submissions/:id/submit', async () => {
    const sub = { id: 'sub_1', status: 'submitted' };
    fetchMock.mockResolvedValueOnce(new Response(envelope(sub), { status: 200 }));
    const result = await api.submitSubmission(session, 'sub_1');
    expect(result.id).toBe('sub_1');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1\/submit$/);
    expect(init.method).toBe('POST');
  });

  it('createUploadUrl — POST /assignment-submissions/:id/upload-url with payload', async () => {
    const intent = {
      fileId: 'file_abc',
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'submissions/tenant_demo/x.pdf',
      expiresInSeconds: 900
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(intent), { status: 200 }));
    const payload = { originalName: 'work.pdf', contentType: 'application/pdf', sizeBytes: 1024 };
    const result = await api.createUploadUrl(session, 'sub_1', payload);
    expect(result.fileId).toBe('file_abc');
    expect(result.uploadUrl).toBe('https://minio.local/PUT-signed');
    const [u, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(u).pathname).toMatch(/\/assignment-submissions\/sub_1\/upload-url$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });
});

describe('putFileToPresignedUrl — raw PUT to MinIO (no API envelope)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('issues a raw PUT to the given URL with the file Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const { putFileToPresignedUrl } = await import('./api');
    const file = new File(['hello'], 'work.pdf', { type: 'application/pdf' });
    await putFileToPresignedUrl('https://minio.local/PUT-signed?sig=abc', file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://minio.local/PUT-signed?sig=abc');
    expect(init.method).toBe('PUT');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Content-Type')).toBe('application/pdf');
    expect(init.body).toBe(file);
  });

  it('throws when the presigned PUT returns a non-OK status', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { putFileToPresignedUrl } = await import('./api');
    const file = new File(['bad'], 'fail.pdf', { type: 'application/pdf' });
    await expect(putFileToPresignedUrl('https://minio.local/PUT-expired', file)).rejects.toThrow(
      'HTTP 403'
    );
  });
});
