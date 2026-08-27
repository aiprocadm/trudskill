import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { learnerDocumentsApi as LearnerDocumentsApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: 'learner@example.com',
    displayName: 'Слушатель',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['learner'],
  permissions: ['enrollments.read']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

/**
 * Ревизия 2026-08-26 (порция 21): скачивание документа кабинета идёт через ручку
 * с авторизацией — она отдаёт подписанную ссылку хранилища. Тест держит контракт:
 * путь, заголовки, разворачивание конверта.
 */
describe('learnerDocumentsApi.getDownload', () => {
  let learnerDocumentsApi: typeof LearnerDocumentsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    learnerDocumentsApi = importedModule.learnerDocumentsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('зовёт ручку скачивания с авторизацией и разворачивает конверт', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ downloadUrl: 'https://storage.example/presigned' }), { status: 200 })
    );

    const result = await learnerDocumentsApi.getDownload(session, 'doc_1');
    expect(result.downloadUrl).toBe('https://storage.example/presigned');

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain('/me/documents/doc_1/download');
    const headers = new Headers(calledInit.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('x-tenant-id')).toBe('tenant_demo');
  });
});
