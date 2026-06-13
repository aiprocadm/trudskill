import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { scormApi as ScormApi } from './api';
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
  permissions: ['materials.read', 'materials.write', 'progress.recalculate']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const packageDto = {
  id: 'scp_1',
  title: 'Test SCORM',
  packageStatus: 'uploaded',
  zipFileId: 'file_1',
  createdAt: '2026-06-12T00:00:00.000Z',
  updatedAt: '2026-06-12T00:00:00.000Z'
};

const attemptDto = {
  id: 'sca_1',
  enrollmentId: 'enr_1',
  materialId: 'mat_1',
  lessonStatus: 'not attempted',
  totalSeconds: 0,
  startedAt: '2026-06-12T00:00:00.000Z'
};

describe('scormApi envelope compatibility (Phase 9 Plan A)', () => {
  let scormApi: typeof ScormApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    scormApi = (await import('./api')).scormApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list: GET /scorm-packages unwraps items + total', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [packageDto], total: 1 }), { status: 200 })
    );
    const result = await scormApi.list(session);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).pathname).toMatch(/\/scorm-packages$/);
    expect(init.method).toBe('GET');
  });

  it('register: POST /scorm-packages unwraps the created package', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(packageDto), { status: 201 }));
    const result = await scormApi.register(session, { zipFileId: 'file_1', title: 'Test SCORM' });
    expect(result.id).toBe('scp_1');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).pathname).toMatch(/\/scorm-packages$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ zipFileId: 'file_1', title: 'Test SCORM' }));
  });

  it('process: POST /scorm-packages/:id/process unwraps the updated package', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ ...packageDto, packageStatus: 'ready' }), { status: 201 })
    );
    const result = await scormApi.process(session, 'scp_1');
    expect(result.packageStatus).toBe('ready');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/scorm-packages/scp_1/process');
    expect(init.method).toBe('POST');
  });

  it('launch: POST /scorm-materials/:id/launch sends enrollmentId and unwraps launch dto', async () => {
    const launchDto = {
      attempt: attemptDto,
      token: 'tok_abc123',
      launchUrl: '/api/v1/scorm-content/tok_abc123/index.html'
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(launchDto), { status: 201 }));
    const result = await scormApi.launch(session, 'mat_1', 'enr_1');
    expect(result.token).toBe('tok_abc123');
    expect(result.launchUrl).toContain('tok_abc123');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/scorm-materials/mat_1/launch');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ enrollmentId: 'enr_1' }));
  });

  it('commit: PUT /scorm-attempts/:id/commit sends the payload and unwraps the updated attempt', async () => {
    const updatedAttempt = {
      ...attemptDto,
      lessonStatus: 'passed',
      totalSeconds: 600
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(updatedAttempt), { status: 200 }));
    const result = await scormApi.commit(session, 'sca_1', {
      lessonStatus: 'passed',
      sessionSeconds: 600
    });
    expect(result.lessonStatus).toBe('passed');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/scorm-attempts/sca_1/commit');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ lessonStatus: 'passed', sessionSeconds: 600 }));
  });
});
