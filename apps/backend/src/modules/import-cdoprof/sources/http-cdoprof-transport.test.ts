import { describe, expect, it, vi } from 'vitest';

import { CdoprofApiError } from './cdoprof-transport.js';
import { HttpCdoprofTransport } from './http-cdoprof-transport.js';

const SECRET = 'secret-key-XYZ';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const makeTransport = (
  responses: Array<Response | Error>,
  overrides: { pauseMs?: number } = {}
) => {
  const queue = [...responses];
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    urls.push(String(input));
    const next = queue.shift();
    if (!next) throw new Error('очередь ответов пуста');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms);
  });
  const transport = new HttpCdoprofTransport({
    baseUrl: 'https://cdoprof.example.invalid/',
    apiKey: SECRET,
    pauseMs: overrides.pauseMs ?? 300,
    maxRetries: 2,
    retryBaseMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep
  });
  return { transport, urls, sleeps, fetchImpl };
};

describe('HttpCdoprofTransport', () => {
  it('добавляет api_key и параметры в строку запроса, пропуская undefined', async () => {
    const { transport, urls } = makeTransport([jsonResponse({ success: true, data: {} })]);

    await transport.get('contragent.get', { page: 2, limit: 100, search: undefined });

    expect(urls[0]).toBe(
      `https://cdoprof.example.invalid/api/v1/contragent.get?api_key=${SECRET}&page=2&limit=100`
    );
  });

  it('выдерживает паузу между запросами, но не перед первым', async () => {
    const { transport, sleeps } = makeTransport([
      jsonResponse({ data: 1 }),
      jsonResponse({ data: 2 }),
      jsonResponse({ data: 3 })
    ]);

    await transport.get('a');
    await transport.get('b');
    await transport.get('c');

    expect(sleeps).toEqual([300, 300]);
  });

  it('повторяет запрос при 500 и 429 с растущей задержкой и отдаёт результат', async () => {
    const { transport, sleeps, fetchImpl } = makeTransport([
      jsonResponse('oops', 500),
      jsonResponse('slow down', 429),
      jsonResponse({ data: 'ok' })
    ]);

    await expect(transport.get('group.get')).resolves.toEqual({ data: 'ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('повторяет запрос после сетевой ошибки', async () => {
    const { transport } = makeTransport([new Error('ECONNRESET'), jsonResponse({ data: 'ok' })]);

    await expect(transport.get('group.get')).resolves.toEqual({ data: 'ok' });
  });

  it('после maxRetries сдаётся с http_error', async () => {
    const { transport, fetchImpl } = makeTransport([
      jsonResponse('x', 503),
      jsonResponse('x', 503),
      jsonResponse('x', 503)
    ]);

    const error = await transport.get('group.get').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CdoprofApiError);
    expect((error as CdoprofApiError).code).toBe('http_error');
    expect((error as CdoprofApiError).status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('401 и 403 → unauthorized без повторов', async () => {
    for (const status of [401, 403]) {
      const { transport, fetchImpl } = makeTransport([jsonResponse('denied', status)]);
      const error = await transport.get('group.get').catch((e: unknown) => e);

      expect((error as CdoprofApiError).code).toBe('unauthorized');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('404 не повторяется', async () => {
    const { transport, fetchImpl } = makeTransport([jsonResponse('nope', 404)]);

    const error = await transport.get('nope.get').catch((e: unknown) => e);

    expect((error as CdoprofApiError).code).toBe('http_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('не-JSON → invalid_json; success:false → api_error', async () => {
    const html = new Response('<html>login</html>', { status: 200 });
    const first = makeTransport([html]);
    const e1 = await first.transport.get('a').catch((e: unknown) => e);
    expect((e1 as CdoprofApiError).code).toBe('invalid_json');

    const second = makeTransport([jsonResponse({ success: false, message: 'bad key' })]);
    const e2 = await second.transport.get('a').catch((e: unknown) => e);
    expect((e2 as CdoprofApiError).code).toBe('api_error');
    expect((e2 as CdoprofApiError).message).toContain('bad key');
  });

  it('ни одно сообщение об ошибке не содержит ключ', async () => {
    const cases = [
      [jsonResponse('denied', 401)],
      [jsonResponse('x', 404)],
      [new Response('<html/>', { status: 200 })],
      [jsonResponse({ success: false, message: `echo api_key=${SECRET}` })],
      [jsonResponse('x', 500), jsonResponse('x', 500), jsonResponse('x', 500)]
    ];

    for (const responses of cases) {
      const { transport } = makeTransport(responses);
      const error = (await transport.get('a').catch((e: unknown) => e)) as Error;
      expect(error.message).not.toContain(SECRET);
      expect(error.message).toContain('api_key=***');
    }
  });
});
