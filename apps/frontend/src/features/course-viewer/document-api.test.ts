import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { documentMaterialApi as DocumentApi } from './document-api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Открытие документа урока (ФТ-B4.1, Фаза 2 Task 9). */
describe('document material api', () => {
  const fetchMock = vi.fn();
  let documentMaterialApi: typeof DocumentApi;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-28T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    documentMaterialApi = (await import('./document-api')).documentMaterialApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('один запрос отдаёт ссылку и отмечает открытие', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ url: 'https://s3/doc.pdf', expiresInSeconds: 600, completedByOpening: true })
    );

    const view = await documentMaterialApi.open(session, 'mat_1', 'enr_1');

    expect(view.completedByOpening).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/document-materials/mat_1/open');
    // POST: запрос МЕНЯЕТ состояние (пишет прогресс) и не должен кэшироваться.
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enrollmentId: 'enr_1' });
  });

  it('отказ доступа доходит текстом, а не пустым вьювером', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'domain_rule_violation', message: 'Зачисление не связано с курсом' },
          meta: {}
        }),
        { status: 412, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(documentMaterialApi.open(session, 'mat_1', 'enr_1')).rejects.toThrow(/Зачисление/);
  });
});
