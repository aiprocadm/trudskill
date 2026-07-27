import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  closeGroupApi as CloseGroupApi,
  describeProgress as DescribeProgress,
  GroupClosureStatusDto
} from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

const status = (over: Partial<GroupClosureStatusDto> = {}): GroupClosureStatusDto => ({
  groupId: 'g1',
  total: 4,
  queued: 0,
  running: 0,
  completed: 4,
  failed: 0,
  isComplete: true,
  ...over
});

describe('close-group api contract (ФТ-A5)', () => {
  const fetchMock = vi.fn();
  let closeGroupApi: typeof CloseGroupApi;
  let describeProgress: typeof DescribeProgress;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-27T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    closeGroupApi = mod.closeGroupApi;
    describeProgress = mod.describeProgress;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('close отправляет состав группы одним запросом', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        protocol: { id: 't1', status: 'queued', documentType: 'protocol', sourceEntityId: 'g1' },
        certificates: [],
        created: 1,
        retried: 0
      })
    );

    const result = await closeGroupApi.close(session, {
      groupId: 'g1',
      protocolTemplateId: 'tpl_p',
      certificateTemplateId: 'tpl_c',
      enrollmentIds: ['e1', 'e2']
    });

    expect(result.created).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/admin/documents/close-group');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).enrollmentIds).toEqual(['e1', 'e2']);
  });

  it('status спрашивает сводку по конкретной группе', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope(status()));

    const result = await closeGroupApi.status(session, 'g1');

    expect(result.isComplete).toBe(true);
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/admin/documents/close-group/g1');
  });

  it('fetchPackage тянет ZIP мимо конверта и даёт имя файла', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(['zip-bytes']), {
        status: 200,
        headers: { 'content-type': 'application/zip' }
      })
    );

    const { blob, filename } = await closeGroupApi.fetchPackage(session, 'g1');

    expect(filename).toBe('group-g1.zip');
    expect(blob.size).toBeGreaterThan(0);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/admin/documents/close-group/g1/package');
    // Заголовки те же, что у CSV-экспорта: конверт не применяется, авторизация вручную.
    expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBe('tenant_demo');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('fetchPackage сообщает об отказе сервера, а не молчит', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response('empty', { status: 400 }));

    await expect(closeGroupApi.fetchPackage(session, 'g1')).rejects.toThrow(/400/);
  });

  describe('describeProgress', () => {
    it('пустая группа названа своими словами', () => {
      expect(describeProgress(status({ total: 0, completed: 0, isComplete: false }))).toBe(
        'Группа ещё не закрывалась'
      );
    });

    it('готовая группа показывает счёт', () => {
      expect(describeProgress(status())).toBe('Готово: 4 из 4');
    });

    it('в процессе перечисляет только непустые состояния', () => {
      expect(
        describeProgress(
          status({ total: 5, completed: 2, failed: 1, running: 0, queued: 2, isComplete: false })
        )
      ).toBe('готово 2 из 5, с ошибкой 1, в очереди 2');
    });
  });
});
