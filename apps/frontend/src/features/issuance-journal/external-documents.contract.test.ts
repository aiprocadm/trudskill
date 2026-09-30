import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ExternalModule from './external-documents';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: 'm@example.com',
    displayName: 'Методист',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['documents.read', 'documents.write']
};

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-30T10:00:00.000Z' }
    }),
    { status: 200 }
  );

describe('внешние документы на экране (МГ-F4.1, срез 22.2)', () => {
  let mod: typeof ExternalModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mod = await import('./external-documents');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('внесение, адрес для скана и привязка скана — по адресам ТЗ §16', async () => {
    fetchMock.mockImplementation(async () =>
      envelope({ id: 'gdoc_1', documentNumber: '264501-3', fileId: 'f', uploadUrl: 'u' })
    );
    await mod.externalDocumentsApi.registerExternalDocument(session, {
      kindCode: 'certificate.ot',
      number: '264501-3',
      date: '2025-02-01',
      learnerId: 'l1'
    });
    await mod.externalDocumentsApi.externalScanUploadUrl(session, {
      name: 'scan.pdf',
      type: 'application/pdf',
      size: 1000
    });
    await mod.externalDocumentsApi.attachExternalScan(session, 'gdoc_1', 'f');
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/documents\/external$/);
    expect(urls[1]).toMatch(/\/documents\/external\/upload-url$/);
    expect(urls[2]).toMatch(/\/documents\/external\/gdoc_1\/scan$/);
    const first = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(first.body))).toMatchObject({
      sourceSystem: 'manual',
      number: '264501-3'
    });
  });

  it('форма объясняет, чего не хватает; в книге — вид и пометка «внешний»', () => {
    expect(mod.externalFormBlocked({ kindCode: '', number: '', date: '', learnerId: '' })).toBe(
      'Выберите вид документа'
    );
    expect(
      mod.externalFormBlocked({
        kindCode: 'certificate.ot',
        number: '1',
        date: '2025-02-01',
        learnerId: ''
      })
    ).toBe('Выберите слушателя');
    expect(
      mod.externalFormBlocked({
        kindCode: 'certificate.ot',
        number: '1',
        date: '2025-02-01',
        learnerId: 'l1'
      })
    ).toBeUndefined();
    const kindName = (code: string) => (code === 'certificate.ot' ? 'Удостоверение' : undefined);
    expect(
      mod.journalKindView(
        { kindCode: 'certificate.ot', isExternal: true },
        'Удостоверение',
        kindName
      )
    ).toBe('Удостоверение (внешний)');
    expect(mod.journalKindView({}, 'Приказ', kindName)).toBe('Приказ');
  });
});
