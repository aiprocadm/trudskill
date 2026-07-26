import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  fetchPreviewPdfUrl as FetchPreviewPdfUrl,
  putTemplateFile as PutTemplateFile,
  templatesApi as TemplatesApi
} from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('templates api contract (ФТ-A3)', () => {
  const fetchMock = vi.fn();
  let templatesApi: typeof TemplatesApi;
  let putTemplateFile: typeof PutTemplateFile;
  let fetchPreviewPdfUrl: typeof FetchPreviewPdfUrl;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-26T00:00:00.000Z' }
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    templatesApi = mod.templatesApi;
    putTemplateFile = mod.putTemplateFile;
    fetchPreviewPdfUrl = mod.fetchPreviewPdfUrl;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('uploadUrl asks the templates-specific intent endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        fileId: 'f1',
        uploadUrl: 'https://s3/PUT',
        storageKey: 'k',
        expiresInSeconds: 900
      })
    );
    const intent = await templatesApi.uploadUrl(session, {
      originalName: 'blank.docx',
      sizeBytes: 4096
    });
    expect(intent.fileId).toBe('f1');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/templates/upload-url');
    expect(JSON.parse(init.body as string)).toEqual({
      originalName: 'blank.docx',
      sizeBytes: 4096
    });
  });

  it('putTemplateFile signs the PUT with the SAME docx mime the intent was signed with', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    // У .docx в браузере file.type нередко пуст — заголовок обязан быть явным, иначе 403.
    const file = new File(['x'], 'blank.docx', { type: '' });
    await putTemplateFile('https://s3/PUT', file);
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(DOCX_MIME);
  });

  it('putTemplateFile surfaces a storage rejection', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(
      putTemplateFile('https://s3/PUT', new File(['x'], 'b.docx', { type: DOCX_MIME }))
    ).rejects.toThrow(/403/);
  });

  it('parseVariables returns the known/unknown split for the admin table', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        templateVersionId: 'v1',
        placeholders: ['learner.full_name', 'learner.typo'],
        known: [{ code: 'learner.full_name', category: 'learner', description: 'ФИО' }],
        unknown: ['learner.typo']
      })
    );
    const parsed = await templatesApi.parseVariables(session, 'v1');
    expect(parsed.known[0]!.code).toBe('learner.full_name');
    expect(parsed.unknown).toEqual(['learner.typo']);
    expect((fetchMock.mock.calls[0]! as [string])[0]).toContain(
      '/template-versions/v1/parse-variables'
    );
  });

  it('preview returns an object URL for the binary PDF (not the envelope)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview') });
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(['%PDF-1.7']), {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      })
    );
    const url = await fetchPreviewPdfUrl(session, 'v1');
    expect(url).toBe('blob:preview');
    const [previewUrl, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(previewUrl).toContain('/template-versions/v1/preview');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect((init.headers as Record<string, string>)['x-tenant-id']).toBe('tenant_demo');
  });

  it('preview shows the human-readable reason from the error envelope', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'Не удалось заполнить бланк: unclosed loop' } }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    await expect(fetchPreviewPdfUrl(session, 'v1')).rejects.toThrow(/unclosed loop/);
  });
});
