import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { operationsApi as OperationsApi } from './api';
import type { UserSession } from '../../entities/session/model';

/**
 * Экран «Эксплуатация» (ФТ-I2, Фаза 6 Task 8).
 *
 * Ручки уже были на бэкенде — здесь проверяется, что фронт зовёт ИМЕННО их и правильно
 * разворачивает конверт ответа. Ошибка в адресе означала бы кнопку, которая молча ничего
 * не чинит, — ровно то, от чего задача и избавляет.
 */
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
  permissions: ['operations.quarantine.read', 'operations.quarantine.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('operationsApi — конверт и адреса', () => {
  let operationsApi: typeof OperationsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const importedModule = await import('./api');
    operationsApi = importedModule.operationsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('список карантина разворачивается из конверта', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          items: [
            {
              id: 'qtn_1',
              messageId: 'msg_1',
              jobType: 'document',
              queueName: 'jobs.dead-letter',
              routingKey: 'lms.document_generation',
              retryCount: 10,
              lastError: 'gotenberg timeout',
              status: 'quarantined',
              quarantinedAt: '2026-08-08T10:00:00.000Z',
              resolvedAt: null,
              resolvedBy: null,
              republishCount: 0,
              replayable: true
            }
          ],
          total: 1
        }),
        { status: 200 }
      )
    );

    const page = await operationsApi.listQuarantine(session, 'quarantined');

    expect(page.total).toBe(1);
    expect(page.items[0]?.replayable).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/job-quarantine');
    expect(url).toContain('status=quarantined');
  });

  it('возврат в работу идёт POST на нужный адрес', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'qtn_1', status: 'republished' }), { status: 200 })
    );

    await operationsApi.republishQuarantined(session, 'qtn_1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/job-quarantine/qtn_1/republish');
    expect(init.method).toBe('POST');
  });

  it('повтор задачи документа зовёт ручку retry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'task_1', status: 'queued' }), { status: 200 })
    );

    const result = await operationsApi.retryDocumentTask(session, 'task_1');

    expect(result.status).toBe('queued');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/document-tasks/task_1/retry');
    expect(init.method).toBe('POST');
  });

  it('повторная отправка письма зовёт ручку resend', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'emaildlv_2',
          templateKey: 'enrollment_created',
          recipientEmail: 'learner@example.com',
          subject: 'Вы зачислены',
          status: 'sent',
          resentFromId: 'emaildlv_1',
          createdAt: '2026-08-08T10:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await operationsApi.resendEmail(session, 'emaildlv_1');

    expect(result.resentFromId).toBe('emaildlv_1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/email-deliveries/emaildlv_1/resend');
    expect(init.method).toBe('POST');
  });

  it('журнал писем и задачи читаются со своих адресов', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], total: 0 }), { status: 200 })
    );
    await operationsApi.listEmailDeliveries(session);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/email-deliveries');

    fetchMock.mockResolvedValueOnce(new Response(envelope({ items: [] }), { status: 200 }));
    await operationsApi.listDocumentTasks(session);
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('/document-tasks');
  });
});
