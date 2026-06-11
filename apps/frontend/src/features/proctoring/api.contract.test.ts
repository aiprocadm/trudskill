import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { proctoringApi as ProctoringApi } from './api';
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
  permissions: ['proctoring.read', 'proctoring.submit']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const recordingDto = {
  id: 'prec_1',
  learnerId: 'l1',
  groupId: 'g1',
  courseId: 'c1',
  recordingStatus: 'recording',
  consentAt: '2026-06-11T10:00:00.000Z',
  startedAt: '2026-06-11T10:00:00.000Z',
  chunks: [],
  createdAt: '2026-06-11T10:00:00.000Z'
};

describe('proctoringApi envelope compatibility (Phase 4 Plan B)', () => {
  let proctoringApi: typeof ProctoringApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    proctoringApi = (await import('./api')).proctoringApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('start: POST /proctoring-recordings unwraps the session', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(recordingDto), { status: 201 }));
    const result = await proctoringApi.start(session, {
      enrollmentId: 'enr_1',
      courseId: 'c1',
      consent: true
    });
    expect(result.recordingStatus).toBe('recording');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).pathname).toMatch(/\/proctoring-recordings$/);
    expect(init.method).toBe('POST');
  });

  it('chunkUploadUrl: POST /proctoring-recordings/:id/chunk-upload-intent unwraps the intent', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          fileId: 'file_1',
          uploadUrl: 'https://minio.example.com/upload',
          storageKey: 'proctoring/t/x.webm',
          expiresInSeconds: 900
        }),
        { status: 201 }
      )
    );
    const result = await proctoringApi.chunkUploadUrl(session, 'prec_1', {
      sequence: 0,
      originalName: 'chunk-0.webm',
      contentType: 'video/webm',
      sizeBytes: 2048
    });
    expect(result.fileId).toBe('file_1');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1/chunk-upload-intent');
    expect(init.method).toBe('POST');
  });

  it('complete: POST /proctoring-recordings/:id/complete unwraps the completed session', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ ...recordingDto, recordingStatus: 'completed' }), { status: 201 })
    );
    const result = await proctoringApi.complete(session, 'prec_1');
    expect(result.recordingStatus).toBe('completed');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1/complete');
    expect(init.method).toBe('POST');
  });

  it('active: GET /proctoring-recordings/active?enrollmentId&courseId unwraps data (null case)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(null), { status: 200 }));
    const result = await proctoringApi.active(session, 'enr_1', 'c1');
    expect(result).toBeNull();
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/active?enrollmentId=enr_1&courseId=c1');
    expect(init.method).toBe('GET');
  });

  it('list: GET /proctoring-recordings?status= unwraps rows', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope([{ ...recordingDto, learnerName: 'Иванов Иван', courseTitle: 'ОТ' }]), {
        status: 200
      })
    );
    const result = await proctoringApi.list(session, 'recording');
    expect(result[0]!.learnerName).toBe('Иванов Иван');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/proctoring-recordings?status=recording');
  });

  it('get: GET /proctoring-recordings/:id unwraps detail with playback chunks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          ...recordingDto,
          learnerName: 'Иванов Иван',
          courseTitle: 'ОТ',
          playbackChunks: [{ sequence: 0, fileId: 'f0', url: 'https://minio/0' }],
          chunkIssues: [{ sequence: 1, code: 'missing_chunk' }]
        }),
        { status: 200 }
      )
    );
    const result = await proctoringApi.get(session, 'prec_1');
    expect(result.playbackChunks).toHaveLength(1);
    expect(result.chunkIssues[0]!.code).toBe('missing_chunk');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1');
  });

  it('setOverride: PATCH /enrollments/:id/proctoring-override sends the override body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'enr_1', proctoringOverride: 'exempt' }), { status: 200 })
    );
    await proctoringApi.setOverride(session, 'enr_1', { override: 'exempt' });
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/enrollments/enr_1/proctoring-override');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ override: 'exempt' }));
  });
});
