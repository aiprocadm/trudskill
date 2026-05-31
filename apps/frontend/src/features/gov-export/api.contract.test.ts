import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { govExportApi as GovExportApiType } from './api';
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
  permissions: ['regulatory.export.write', 'regulatory.export.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('govExportApi envelope compatibility', () => {
  let govExportApi: typeof GovExportApiType;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    govExportApi = importedModule.govExportApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('createOtRegistryExport posts to /ot-registry/exports and unwraps batchId', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          batchId: 'batch_1',
          fileId: 'file_1',
          total: 10,
          exported: 9,
          failed: 1,
          rows: [],
          errors: []
        }),
        { status: 201 }
      )
    );

    const result = await govExportApi.createOtRegistryExport(session, {
      groupId: 'grp_1',
      enrolledFrom: '2026-01-01',
      enrolledTo: '2026-12-31'
    });

    expect(result.batchId).toBe('batch_1');
    expect(result.exported).toBe(9);
    expect(result.failed).toBe(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/ot-registry/exports');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { groupId: string };
    expect(body.groupId).toBe('grp_1');
  });

  it('importResponse posts to /ot-registry/exports/:id/registry-response and unwraps outcome', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          matched: 8,
          unmatched: 1,
          unmatchedRows: [
            {
              snils: '000-000-000 00',
              protocolNumber: 'П-999',
              programRegistryId: 1,
              registrationNumber: 'REG-999'
            }
          ]
        }),
        { status: 200 }
      )
    );

    const result = await govExportApi.importResponse(session, 'batch_1', 'base64string==');

    expect(result.matched).toBe(8);
    expect(result.unmatched).toBe(1);
    expect(result.unmatchedRows).toHaveLength(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/ot-registry/exports/batch_1/registry-response');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { fileBase64: string };
    expect(body.fileBase64).toBe('base64string==');
  });

  it('createOtRegistryExport throws on 403 permission denied', async () => {
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
      govExportApi.createOtRegistryExport(session, { groupId: 'grp_1' })
    ).rejects.toThrow();
  });
});
