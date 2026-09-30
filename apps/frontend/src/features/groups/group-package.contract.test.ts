import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PackageModule from './group-package';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: 'c@example.com',
    displayName: 'Куратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['curator'],
  permissions: ['documents.read', 'documents.generate']
};

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-30T10:00:00.000Z' }
    }),
    { status: 200 }
  );

describe('пакет документов группы на экране (МГ-F2.1, срез 21.2)', () => {
  let mod: typeof PackageModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mod = await import('./group-package');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('GET и POST пакета — по адресам ТЗ §16', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ groupId: 'g1', learners: 2, kinds: [] }));
    await mod.groupPackageApi.view(session, 'g1');
    fetchMock.mockResolvedValueOnce(
      envelope({
        tasks: 3,
        created: 3,
        retried: 0,
        learnersIncluded: 1,
        skipped: [],
        groupStatus: 'documents'
      })
    );
    await mod.groupPackageApi.issuePackage(session, 'g1', {
      kinds: ['certificate.ot'],
      protocolDate: '2026-12-18'
    });
    const [viewUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [issueUrl, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(viewUrl).toMatch(/\/groups\/g1\/document-package$/);
    expect(issueUrl).toMatch(/\/groups\/g1\/document-package\/issue$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      kinds: ['certificate.ot'],
      protocolDate: '2026-12-18'
    });
  });

  it('срез 21.3: закрыть группу предлагается, когда пакет выдан и группа в «документах»', () => {
    expect(mod.canMarkClosed({ complete: true, groupStatus: 'documents' })).toBe(true);
    expect(mod.canMarkClosed({ complete: true, groupStatus: 'closed' })).toBe(false);
    expect(mod.canMarkClosed({ complete: false, groupStatus: 'documents' })).toBe(false);
    expect(mod.hasIssued([{ issued: 0 }, { issued: 2 }])).toBe(true);
    expect(mod.hasIssued([{ issued: 0 }])).toBe(false);
  });

  it('журнал 664: неудачная загрузка комплекта — текстом сервера, а не кодом HTTP', async () => {
    const { closeGroupApi } = await import('../close-group/api');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'group_package_empty', message: 'Ни один документ группы ещё не готов' }
        }),
        { status: 400 }
      )
    );
    await expect(closeGroupApi.fetchPackage(session, 'g1')).rejects.toThrow(
      'Ни один документ группы ещё не готов'
    );
  });

  it('словами: состояние, «выпущено», что выпускать по умолчанию, итог с пропущенными', () => {
    const row = (over: Partial<PackageModule.PackageKindRow>): PackageModule.PackageKindRow => ({
      key: 'k',
      title: 'Удостоверение',
      scope: 'learner',
      templateId: 't',
      isRequired: true,
      expected: 3,
      issued: 1,
      inProgress: 0,
      failed: 0,
      state: 'partial',
      documentIds: [],
      ...over
    });
    expect(mod.PACKAGE_STATE_LABELS.partial).toBe('Выпущен не всем');
    expect(mod.issuedView(row({}))).toBe('1 из 3');
    expect(mod.issuedView(row({ scope: 'group', issued: 1, expected: 1 }))).toBe('да');
    expect(mod.defaultKinds([row({ key: 'a', state: 'issued' }), row({ key: 'b' })])).toEqual([
      'b'
    ]);
    expect(
      mod.toPackageOutcome({
        tasks: 3,
        created: 3,
        retried: 0,
        learnersIncluded: 1,
        groupStatus: 'documents',
        skipped: [
          { enrollmentId: 'e2', learnerName: 'Петров Пётр', reasons: ['Не заполнен СНИЛС'] }
        ]
      })
    ).toEqual({
      total: 2,
      succeeded: 1,
      failures: [{ label: 'Петров Пётр', reason: 'Не заполнен СНИЛС' }]
    });
  });
});
