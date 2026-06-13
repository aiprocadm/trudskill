import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { reportBuilderApi as ReportApi } from './api';
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
  permissions: ['enrollments.read', 'enrollments.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const ok = (body: string) =>
  Promise.resolve(
    new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  );

describe('reportBuilderApi envelope compatibility (Phase 10 Track A)', () => {
  let reportBuilderApi: typeof ReportApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    reportBuilderApi = (await import('./api')).reportBuilderApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('entities unwraps the envelope data', async () => {
    fetchMock.mockReturnValueOnce(
      ok(envelope({ entities: [{ key: 'learners', label: 'Ученики', fields: [], filters: [] }] }))
    );
    const meta = await reportBuilderApi.entities(session);
    expect(meta.entities[0]?.key).toBe('learners');
  });

  it('preview returns columns/rows/total', async () => {
    fetchMock.mockReturnValueOnce(
      ok(
        envelope({
          columns: [{ key: 'fullName', header: 'ФИО', type: 'string' }],
          rows: [{ fullName: 'X' }],
          total: 1,
          truncated: false
        })
      )
    );
    const preview = await reportBuilderApi.preview(session, {
      entityKey: 'learners',
      selectedFields: ['fullName']
    });
    expect(preview.total).toBe(1);
    expect(preview.columns[0]?.header).toBe('ФИО');
  });

  it('export returns base64-in-envelope', async () => {
    fetchMock.mockReturnValueOnce(
      ok(
        envelope({
          fileName: 'report-learners-tenant_d.xlsx',
          mimeType: 'x',
          contentBase64: 'UEs='
        })
      )
    );
    const out = await reportBuilderApi.export(session, {
      entityKey: 'learners',
      selectedFields: ['fullName']
    });
    expect(out.contentBase64).toBe('UEs=');
    expect(out.fileName.endsWith('.xlsx')).toBe(true);
  });

  it('saveTemplate POSTs and unwraps the created template', async () => {
    fetchMock.mockReturnValueOnce(
      ok(
        envelope({
          id: 'rpt_1',
          tenantId: 'tenant_demo',
          name: 'X',
          entityKey: 'learners',
          selectedFields: ['fullName'],
          filters: [],
          createdAt: 't',
          updatedAt: 't'
        })
      )
    );
    const tpl = await reportBuilderApi.saveTemplate(session, {
      name: 'X',
      entityKey: 'learners',
      selectedFields: ['fullName']
    });
    expect(tpl.id).toBe('rpt_1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
  });
});
