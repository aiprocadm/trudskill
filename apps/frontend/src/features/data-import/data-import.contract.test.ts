import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from './api';
import type * as ModelModule from './model';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'a@example.com',
    displayName: 'Администратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['import.run']
};

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-10-01T10:00:00.000Z' }
    }),
    { status: 200 }
  );

const stats = (
  patch: Partial<
    Record<'created' | 'updated' | 'skipped' | 'failed' | 'mergeCandidates', number>
  > = {}
) => ({
  total: 10,
  created: 4,
  updated: 2,
  skipped: 3,
  failed: 1,
  mergeCandidates: 1,
  withNotes: 0,
  ...patch
});

describe('перенос данных на экране (срез 23.5)', () => {
  let api: typeof ApiModule;
  let model: typeof ModelModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = await import('./api');
    model = await import('./model');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => envelope({ id: 'imp_1', items: [], total: 0 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('запуск, повтор ошибок и отчёт — по адресам ТЗ §16, источник — API', async () => {
    await api.dataImportApi.startImportRun(session, { domain: 'learners', dryRun: true });
    await api.dataImportApi.retryImportRun(session, 'imp_1');
    await api.dataImportApi.listImportRows(session, 'imp_1', {
      errorCode: 'merge_candidate',
      limit: 50
    });
    await api.dataImportApi.listImportRuns(session);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/import\/[a-z]+\/runs$/);
    expect(urls[1]).toMatch(/\/runs\/imp_1\/retry-failed$/);
    expect(urls[2]).toMatch(/\/runs\/imp_1\/rows\?errorCode=merge_candidate&limit=50&offset=0$/);
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      source: 'api',
      domain: 'learners',
      dryRun: true
    });
  });

  it('итог словами: проверка говорит «будет», перенос — «сделано»; идёт — ждать', () => {
    expect(model.runSummary({ dryRun: true, status: 'succeeded', stats: stats() })).toBe(
      'Будет создано 4, будет дополнено 2, пропущено 3, на решение 1, ошибок 1'
    );
    expect(
      model.runSummary({
        dryRun: false,
        status: 'partial',
        stats: stats({ mergeCandidates: 0, failed: 0 })
      })
    ).toBe('Создано 4, дополнено 2, пропущено 3');
    expect(model.runSummary({ dryRun: false, status: 'running', stats: stats() })).toContain(
      'Идёт перенос'
    );
  });

  it('«Повторить только ошибки» — только у завершённого переноса с ошибками', () => {
    expect(model.canRetry({ dryRun: false, status: 'partial', stats: stats() })).toBe(true);
    expect(model.canRetry({ dryRun: true, status: 'partial', stats: stats() })).toBe(false);
    expect(model.canRetry({ dryRun: false, status: 'running', stats: stats() })).toBe(false);
    expect(
      model.canRetry({ dryRun: false, status: 'succeeded', stats: stats({ failed: 0 }) })
    ).toBe(false);
  });

  it('строка отчёта без кодов: похожая запись, уже перенесено, запись по имени и номеру', () => {
    expect(model.rowResultLabel({ action: 'skipped', errorCode: 'merge_candidate' }, false)).toBe(
      'Похожая запись — решите вручную'
    );
    expect(model.rowResultLabel({ action: 'skipped', errorCode: 'unchanged' }, false)).toBe(
      'Уже перенесено'
    );
    expect(model.rowResultLabel({ action: 'created' }, true)).toBe('Будет создано');
    expect(
      model.rowSubject({ raw: { name: 'Иванов И. И.' }, sourceId: '1001', domain: 'learners' })
    ).toBe('Иванов И. И. (№ 1001 в прежней системе)');
    expect(model.rowSubject({ raw: { number: '—' }, sourceId: '5006', domain: 'groups' })).toBe(
      '№ 5006 в прежней системе'
    );
    expect(model.runChipStatus('succeeded')).toBe('completed');
    expect(model.runStatusLabel('partial')).toBe('Готово, есть ошибки');
  });
});
