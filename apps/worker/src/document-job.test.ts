import { describe, expect, it, vi } from 'vitest';

import { NonRetryableJobError } from './bulk-enrollment-callback.js';
import { runDocumentJob } from './document-job.js';
import { buildDocx, p, readDocumentXml } from './render/docx-fixture.js';

const DEPS = { backendPublicUrl: 'http://backend.local', callbackToken: 'secret-token-123' };
const envelope = { messageId: 'm1', tenantId: 'tenant_demo', payload: { taskId: 'dtask_1' } };

const okJson = (data: unknown) =>
  new Response(JSON.stringify({ data, meta: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

/** fetch-мок: маршрутизирует по URL; собирает вызовы internal-эндпоинтов и PUT-тело. */
function makeFetch(overrides: { start?: () => Response; template?: Buffer; failOn?: string }) {
  const calls: Array<{ url: string; body?: unknown }> = [];
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
    if (url.endsWith('/result-upload-intent')) {
      return okJson({ fileId: 'file_res_1', uploadUrl: 'https://s3.local/PUT-result' });
    }
    if (url.includes('PUT-result')) {
      putBody = Buffer.from(init?.body as Uint8Array);
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/complete') || url.endsWith('/fail')) {
      return okJson({ status: 'ok' });
    }
    throw new Error(`unexpected url ${url}`);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, getPutBody: () => putBody };
}

describe('runDocumentJob (Фаза 1 Task 2)', () => {
  it('happy path: claim → download → render → upload → complete; result is a substituted DOCX', async () => {
    const { fetchFn, calls, getPutBody } = makeFetch({});
    await runDocumentJob(envelope, { ...DEPS, fetchFn });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.endsWith('/internal/worker/documents/start'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/complete'))).toBe(true);
    const complete = calls.find((c) => c.url.endsWith('/complete'));
    expect(complete?.body).toMatchObject({ tenantId: 'tenant_demo', fileId: 'file_res_1' });
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
      runDocumentJob(envelope, { backendPublicUrl: 'http://b', callbackToken: undefined })
    ).rejects.toBeInstanceOf(NonRetryableJobError);
  });
});
