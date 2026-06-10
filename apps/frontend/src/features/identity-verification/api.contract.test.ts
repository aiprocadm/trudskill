import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { identityVerificationApi as IdentityApi } from './api';
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
  permissions: ['identity.read', 'identity.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('identityVerificationApi envelope compatibility (Phase 4 Plan A)', () => {
  let identityVerificationApi: typeof IdentityApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    identityVerificationApi = (await import('./api')).identityVerificationApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('me: GET /identity-verifications/me unwraps data (null case)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(null), { status: 200 }));

    const result = await identityVerificationApi.me(session);
    expect(result).toBeNull();

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications/me');
    expect(init.method).toBe('GET');
  });

  it('start: POST /identity-verifications unwraps draft record', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'idv_1',
          learnerId: 'u1',
          method: 'selfie_passport',
          verificationStatus: 'draft',
          createdAt: '2026-01-01T00:00:00.000Z'
        }),
        { status: 201 }
      )
    );

    const result = await identityVerificationApi.start(session, {});
    expect(result.verificationStatus).toBe('draft');
    expect(result.id).toBe('idv_1');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).pathname).toMatch(/\/identity-verifications$/);
    expect(init.method).toBe('POST');
  });

  it('createUploadUrl: POST /identity-verifications/:id/upload-url unwraps upload intent', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          fileId: 'file_1',
          uploadUrl: 'https://minio.example.com/upload',
          storageKey: 'idv/idv_1/selfie.jpg',
          expiresInSeconds: 300
        }),
        { status: 200 }
      )
    );

    const result = await identityVerificationApi.createUploadUrl(session, 'idv_1', {
      originalName: 'selfie.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 102400
    });

    expect(result.fileId).toBe('file_1');
    expect(result.uploadUrl).toContain('https://');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications/idv_1/upload-url');
    expect(init.method).toBe('POST');
  });

  it('submit: POST /identity-verifications/:id/submit unwraps updated record', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'idv_1',
          learnerId: 'u1',
          method: 'selfie_passport',
          verificationStatus: 'pending',
          selfieFileId: 'file_1',
          passportFileId: 'file_2',
          consentAt: '2026-01-01T00:00:00.000Z',
          submittedAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await identityVerificationApi.submit(session, 'idv_1', {
      selfieFileId: 'file_1',
      passportFileId: 'file_2',
      consent: true
    });

    expect(result.verificationStatus).toBe('pending');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications/idv_1/submit');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as {
      selfieFileId?: string;
      passportFileId?: string;
      consent?: boolean;
    };
    expect(body.selfieFileId).toBe('file_1');
    expect(body.passportFileId).toBe('file_2');
    expect(body.consent).toBe(true);
  });

  it('list: GET /identity-verifications without status omits query string', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));

    await identityVerificationApi.list(session);

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).search).toBe('');
  });

  it('list: GET /identity-verifications?status=pending unwraps array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          {
            id: 'idv_1',
            learnerId: 'u1',
            method: 'selfie_passport',
            verificationStatus: 'pending',
            createdAt: '2026-01-01T00:00:00.000Z',
            learnerName: 'Иванов Иван',
            learnerSnils: '12345678901'
          }
        ]),
        { status: 200 }
      )
    );

    const result = await identityVerificationApi.list(session, 'pending');
    expect(result).toHaveLength(1);
    expect(result[0]?.learnerName).toBe('Иванов Иван');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications?status=pending');
    expect(init.method).toBe('GET');
  });

  it('get: GET /identity-verifications/:id unwraps detail record', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'idv_1',
          learnerId: 'u1',
          method: 'selfie_passport',
          verificationStatus: 'pending',
          createdAt: '2026-01-01T00:00:00.000Z',
          learnerName: 'Иванов Иван',
          selfieUrl: 'https://minio.example.com/selfie.jpg',
          passportUrl: 'https://minio.example.com/passport.jpg'
        }),
        { status: 200 }
      )
    );

    const result = await identityVerificationApi.get(session, 'idv_1');
    expect(result.id).toBe('idv_1');
    expect(result.selfieUrl).toContain('https://');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications/idv_1');
    expect(init.method).toBe('GET');
  });

  it('review: POST /identity-verifications/:id/review unwraps updated record', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'idv_1',
          learnerId: 'u1',
          method: 'selfie_passport',
          verificationStatus: 'approved',
          reviewedAt: '2026-01-02T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await identityVerificationApi.review(session, 'idv_1', {
      decision: 'approve'
    });

    expect(result.verificationStatus).toBe('approved');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/identity-verifications/idv_1/review');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { decision?: string };
    expect(body.decision).toBe('approve');
  });
});
