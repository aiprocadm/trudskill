import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SampleModule from './document-sample';
import type { UserSession } from '../../entities/session/model';
import type * as SettingsModule from '../settings/document-issue-section';

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
  permissions: ['documents.generate', 'tenant.settings.write']
};

describe('образец документа и настройка выпуска (МГ-F5.1, срез 20.2)', () => {
  let sample: typeof SampleModule;
  let settings: typeof SettingsModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    sample = await import('./document-sample');
    settings = await import('../settings/document-issue-section');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:sample') }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('POST /documents/sample: тело — шаблон, группа, слушатель; ответ — ссылка на PDF', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Blob(['%PDF']), { status: 200 }));
    const url = await sample.fetchSamplePdfUrl(session, {
      templateId: 't1',
      groupId: 'g1',
      enrollmentId: 'e1'
    });
    expect(url).toBe('blob:sample');
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toMatch(/\/documents\/sample$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      templateId: 't1',
      groupId: 'g1',
      enrollmentId: 'e1'
    });
  });

  it('ошибка — текстом сервера, а не кодом HTTP', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'template_version_missing', message: 'У шаблона нет бланка' }
        }),
        { status: 400 }
      )
    );
    await expect(
      sample.fetchSamplePdfUrl(session, { templateId: 't1', groupId: 'g1' })
    ).rejects.toThrow('У шаблона нет бланка');
  });

  it('настройки выпуска не затирают соседние ключи раздела документов', () => {
    expect(settings.documentSettingsFrom({ documents: { other: 1 } })).toEqual({ other: 1 });
    expect(settings.documentSettingsFrom(null)).toEqual({});
    expect(settings.documentSettingsFrom({ documents: 'мусор' })).toEqual({});
  });
});
