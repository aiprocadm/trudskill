import { buildDocx, p, readDocumentXml, tinyPng } from '@trudskill/docx-render';
import { describe, expect, it, vi } from 'vitest';

import { NonRetryableJobError } from './bulk-enrollment-callback.js';
import { runDocumentJob } from './document-job.js';

const DEPS = {
  backendPublicUrl: 'http://backend.local',
  callbackToken: 'secret-token-123',
  gotenbergUrl: 'http://gotenberg:3000'
};
const PDF_BYTES = Buffer.from('%PDF-1.7\nrendered');
const STAMP_PNG = tinyPng(120, 120, [200, 30, 30]);
const envelope = { messageId: 'm1', tenantId: 'tenant_demo', payload: { taskId: 'dtask_1' } };

const okJson = (data: unknown) =>
  new Response(JSON.stringify({ data, meta: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

/** fetch-мок: маршрутизирует по URL; собирает вызовы internal-эндпоинтов и PUT-тело. */
function makeFetch(overrides: {
  start?: () => Response;
  template?: Buffer;
  failOn?: string;
  gotenberg?: () => Response;
  stampMissing?: boolean;
}) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const puts: Array<{ contentType: string; body: Buffer }> = [];
  let putBody: Buffer | null = null;
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const record: { url: string; body?: unknown } = { url };
    if (init?.body && typeof init.body === 'string') {
      record.body = JSON.parse(init.body);
    }
    calls.push(record);
    if (overrides.failOn && url.includes(overrides.failOn)) {
      return new Response(JSON.stringify({ error: { code: 'boom' } }), { status: 500 });
    }
    if (url.endsWith('/start')) {
      return (
        overrides.start?.() ??
        okJson({
          claimed: true,
          taskId: 'dtask_1',
          number: '26-ОТ-0001',
          templateFileUrl: 'https://s3.local/GET-template',
          variables: { 'document.number': '26-ОТ-0001', 'document.date': '2026-07-26' }
        })
      );
    }
    if (url.includes('GET-template')) {
      const body = overrides.template ?? buildDocx(p('Номер: {document.number}'));
      return new Response(new Uint8Array(body), { status: 200 });
    }
    if (url.includes('GET-stamp')) {
      return overrides.stampMissing
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array(STAMP_PNG), {
            status: 200,
            headers: { 'content-type': 'image/png' }
          });
    }
    if (url.includes('/forms/libreoffice/convert')) {
      return overrides.gotenberg?.() ?? new Response(new Uint8Array(PDF_BYTES), { status: 200 });
    }
    if (url.endsWith('/result-upload-intent')) {
      const isPdf = (record.body as { contentType?: string })?.contentType === 'application/pdf';
      return okJson({
        fileId: isPdf ? 'file_pdf_1' : 'file_res_1',
        uploadUrl: isPdf ? 'https://s3.local/PUT-pdf' : 'https://s3.local/PUT-result'
      });
    }
    if (url.includes('PUT-result') || url.includes('PUT-pdf')) {
      const body = Buffer.from(init?.body as Uint8Array);
      const contentType = (init?.headers as Record<string, string>)['content-type']!;
      puts.push({ contentType, body });
      if (url.includes('PUT-result')) putBody = body;
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/complete') || url.endsWith('/fail')) {
      return okJson({ status: 'ok' });
    }
    throw new Error(`unexpected url ${url}`);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, puts, getPutBody: () => putBody };
}

describe('runDocumentJob (Фаза 1 Task 2)', () => {
  it('happy path: claim → download → render → upload → complete; result is a substituted DOCX', async () => {
    const { fetchFn, calls, getPutBody } = makeFetch({});
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.endsWith('/internal/worker/documents/start'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/complete'))).toBe(true);
    const complete = calls.find((c) => c.url.endsWith('/complete'));
    expect(complete?.body).toMatchObject({
      tenantId: 'tenant_demo',
      fileId: 'file_res_1',
      pdfFileId: 'file_pdf_1',
      // ФТ-A1.4: снапшот подстановки уходит вместе с документом.
      variablesSnapshot: { 'document.number': '26-ОТ-0001', 'document.date': '2026-07-26' }
    });
    // Загруженный результат — настоящий DOCX с подставленным номером.
    expect(readDocumentXml(getPutBody()!)).toContain('Номер: 26-ОТ-0001');
    // Заголовок callback-токена на internal-вызовах.
    const startCall = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((startCall[1] as RequestInit).headers).toMatchObject({
      'x-worker-callback-token': 'secret-token-123'
    });
  });

  it('unclaimed terminal task → silently acks (no further calls)', async () => {
    const { fetchFn, calls } = makeFetch({
      start: () => okJson({ claimed: false, status: 'completed' })
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    expect(calls).toHaveLength(1);
  });

  it('template error → fail endpoint called, job acks without throwing (ФТ-A1.5)', async () => {
    const { fetchFn, calls } = makeFetch({
      template: buildDocx(p('{#group_learners}') + p('нет закрытия'))
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    const fail = calls.find((c) => c.url.endsWith('/fail'));
    expect(fail).toBeDefined();
    expect(String((fail?.body as { message?: string })?.message)).toMatch(
      /group_learners|unclosed|unopened/i
    );
    expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
  });

  it('start 404 (state race) → throws a retryable error', async () => {
    const { fetchFn } = makeFetch({
      start: () => new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 })
    });
    await expect(runDocumentJob(envelope, { ...DEPS, fetchFn })).rejects.toThrow(/not visible yet/);
  });

  it('forbidden callback → NonRetryableJobError (straight to DLQ)', async () => {
    const { fetchFn } = makeFetch({
      start: () => new Response(JSON.stringify({ error: { code: 'forbidden' } }), { status: 403 })
    });
    await expect(runDocumentJob(envelope, { ...DEPS, fetchFn })).rejects.toBeInstanceOf(
      NonRetryableJobError
    );
  });

  it('transport failure on upload-intent → throws (retry with backoff)', async () => {
    const { fetchFn } = makeFetch({ failOn: 'result-upload-intent' });
    await expect(runDocumentJob(envelope, { ...DEPS, fetchFn })).rejects.toThrow(
      /result-upload-intent failed/
    );
  });

  it('missing callback token → NonRetryableJobError', async () => {
    await expect(
      runDocumentJob(envelope, {
        backendPublicUrl: 'http://b',
        callbackToken: undefined,
        gotenbergUrl: 'http://g'
      })
    ).rejects.toBeInstanceOf(NonRetryableJobError);
  });
});

describe('PDF-двойник и снапшот (ФТ-A1.3/A1.4)', () => {
  it('uploads BOTH formats: DOCX with the substituted number and the PDF from Gotenberg', async () => {
    const { fetchFn, puts } = makeFetch({});
    await runDocumentJob(envelope, { ...DEPS, fetchFn });

    expect(puts).toHaveLength(2);
    const docx = puts.find((x) => x.contentType.includes('wordprocessingml'))!;
    const pdf = puts.find((x) => x.contentType === 'application/pdf')!;
    expect(readDocumentXml(docx.body)).toContain('Номер: 26-ОТ-0001');
    expect(pdf.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('sends the rendered DOCX (not the template) to Gotenberg', async () => {
    const { fetchFn, calls } = makeFetch({});
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    expect(calls.some((c) => c.url.includes('/forms/libreoffice/convert'))).toBe(true);
  });

  it('Gotenberg 4xx (cannot open the document) → task failed, no upload, no throw', async () => {
    const { fetchFn, calls, puts } = makeFetch({
      gotenberg: () => new Response('malformed', { status: 400 })
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    const fail = calls.find((c) => c.url.endsWith('/fail'));
    expect(fail).toBeDefined();
    expect(String((fail?.body as { message?: string })?.message)).toMatch(/PDF/i);
    expect(puts).toHaveLength(0);
    expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
  });

  it('Gotenberg 5xx → throws so the consume loop retries; nothing is stored', async () => {
    const { fetchFn, calls, puts } = makeFetch({
      gotenberg: () => new Response('down', { status: 503 })
    });
    await expect(runDocumentJob(envelope, { ...DEPS, fetchFn })).rejects.toThrow(/http=503/);
    expect(puts).toHaveLength(0);
    expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/fail'))).toBe(false);
  });

  it('ФТ-A1.4: re-rendering from the stored snapshot reproduces the byte-identical DOCX', async () => {
    const first = makeFetch({});
    await runDocumentJob(envelope, { ...DEPS, fetchFn: first.fetchFn });
    const firstDocx = first.puts.find((x) => x.contentType.includes('wordprocessingml'))!.body;
    const snapshot = (
      first.calls.find((c) => c.url.endsWith('/complete'))!.body as {
        variablesSnapshot: Record<string, unknown>;
      }
    ).variablesSnapshot;

    // Перевыпуск: тот же шаблон + СНАПШОТ (а не пересобранные заново живые данные).
    const second = makeFetch({
      start: () =>
        okJson({
          claimed: true,
          taskId: 'dtask_reissue',
          number: '26-ОТ-0001',
          templateFileUrl: 'https://s3.local/GET-template',
          variables: snapshot
        })
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn: second.fetchFn });
    const secondDocx = second.puts.find((x) => x.contentType.includes('wordprocessingml'))!.body;

    expect(secondDocx.equals(firstDocx)).toBe(true);
  });
});

describe('картинки в бланке (ФТ-A7.1, Фаза 1 Task 9)', () => {
  const startWithStamp = (images: unknown) => () =>
    okJson({
      claimed: true,
      taskId: 'dtask_1',
      number: '26-ОТ-0001',
      templateFileUrl: 'https://s3.local/GET-template',
      variables: { 'document.number': '26-ОТ-0001', 'tenant.stamp_image': 'file_stamp' },
      images
    });

  const stampTemplate = buildDocx(p('Номер: {document.number}') + p('М.П. {%tenant.stamp_image}'));

  it('скачивает печать и вставляет её в выданный DOCX', async () => {
    const { fetchFn, calls, getPutBody } = makeFetch({
      template: stampTemplate,
      start: startWithStamp([
        { name: 'tenant.stamp_image', url: 'https://s3.local/GET-stamp', widthMm: 30 }
      ])
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });

    expect(calls.map((c) => c.url)).toContain('https://s3.local/GET-stamp');
    const docx = getPutBody()!;
    expect(readDocumentXml(docx)).toContain('<w:drawing>');
    // Ширина 30 мм из настроек тенанта доехала до документа.
    expect(readDocumentXml(docx)).toContain(`cx="${30 * 36000}"`);
  });

  it('недоступная печать не срывает выдачу — документ уходит без факсимиле', async () => {
    const { fetchFn, calls, getPutBody } = makeFetch({
      template: stampTemplate,
      stampMissing: true,
      start: startWithStamp([{ name: 'tenant.stamp_image', url: 'https://s3.local/GET-stamp' }])
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });

    expect(calls.some((c) => c.url.endsWith('/fail'))).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(true);
    const xml = readDocumentXml(getPutBody()!);
    expect(xml).not.toContain('<w:drawing>');
    expect(xml).toContain('Номер: 26-ОТ-0001');
  });

  it('бланк без тегов-картинок не ходит за файлами', async () => {
    const { fetchFn, calls } = makeFetch({ start: startWithStamp(undefined) });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    expect(calls.some((c) => c.url.includes('GET-stamp'))).toBe(false);
  });
});

describe('срок у каждого выхода наружу (журнал 335)', () => {
  it('внутренний API, шаблон, картинка и загрузка результата — все запросы уходят с signal', async () => {
    const { fetchFn } = makeFetch({
      template: buildDocx(p('Номер: {document.number}') + p('М.П. {%tenant.stamp_image}')),
      start: () =>
        okJson({
          claimed: true,
          taskId: 'dtask_1',
          number: '26-ОТ-0001',
          templateFileUrl: 'https://s3.local/GET-template',
          variables: { 'document.number': '26-ОТ-0001', 'tenant.stamp_image': 'file_stamp' },
          images: [{ name: 'tenant.stamp_image', url: 'https://s3.local/GET-stamp' }]
        })
    });
    await runDocumentJob(envelope, { ...DEPS, fetchFn });

    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, RequestInit | undefined]
    >;
    const urls = calls.map(([url]) => url);
    for (const marker of [
      '/start',
      'GET-template',
      'GET-stamp',
      'PUT-result',
      'PUT-pdf',
      '/complete'
    ]) {
      expect(
        urls.some((url) => url.includes(marker)),
        marker
      ).toBe(true);
    }
    const withoutDeadline = calls
      .filter(([, init]) => !(init?.signal instanceof AbortSignal) || init.signal.aborted)
      .map(([url]) => url);
    expect(withoutDeadline).toEqual([]);
  });
});
