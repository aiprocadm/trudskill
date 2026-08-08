import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

describe('ResponseEnvelopeInterceptor contract', () => {
  it('wraps payload in { data, meta } and mirrors request ids to headers', async () => {
    const headers = new Map<string, string>();
    const request = {
      context: {
        requestId: 'req-1',
        correlationId: 'corr-1',
        tenantId: 'tenant_demo',
        userId: 'u1',
        ip: '127.0.0.1',
        userAgent: 'vitest'
      },
      header: (name: string) => {
        if (name === 'x-correlation-id') return 'corr-1';
        if (name === 'x-tenant-id') return 'tenant_demo';
        return undefined;
      },
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const response = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      }
    };

    const interceptor = new ResponseEnvelopeInterceptor();

    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response
      })
    } as never;

    const wrapped = await firstValueFrom(
      interceptor.intercept(executionContext, { handle: () => of({ ok: true }) } as never)
    );

    expect(wrapped).toEqual({
      data: { ok: true },
      meta: {
        requestId: 'req-1',
        correlationId: 'corr-1',
        timestamp: expect.any(String)
      }
    });
    expect(headers.get('x-request-id')).toBe('req-1');
    expect(headers.get('x-correlation-id')).toBe('corr-1');
  });

  /*
   * Фаза 6 Task 5. Ручка `/metrics` объявляет `content-type: text/plain` и отдаёт строку
   * в формате Prometheus — а конверт заворачивал её в JSON. Выходил ответ, который
   * объявлен как текст, но является объектом: Prometheus такое не разбирает, то есть
   * метрики физически нельзя было собрать (проверено curl'ом на стенде).
   */
  it('не заворачивает ответ, объявленный НЕ как JSON (например, метрики)', async () => {
    const headers = new Map<string, string>([
      ['content-type', 'text/plain; version=0.0.4; charset=utf-8']
    ]);
    const request = {
      context: { requestId: 'req-2', correlationId: 'corr-2' },
      header: () => undefined,
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const response = {
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      setHeader: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      }
    };
    const interceptor = new ResponseEnvelopeInterceptor();
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response })
    } as never;

    const body = '# HELP http_requests_total Total HTTP requests\n';
    const result = await firstValueFrom(
      interceptor.intercept(executionContext, { handle: () => of(body) } as never)
    );

    expect(result).toBe(body);
  });

  it('обычный JSON-ответ по-прежнему заворачивается', async () => {
    const headers = new Map<string, string>();
    const request = {
      context: { requestId: 'req-3', correlationId: 'corr-3' },
      header: () => undefined,
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const response = {
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value)
    };
    const interceptor = new ResponseEnvelopeInterceptor();
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response })
    } as never;

    const result = (await firstValueFrom(
      interceptor.intercept(executionContext, { handle: () => of({ ok: true }) } as never)
    )) as { data: unknown };

    expect(result.data).toEqual({ ok: true });
  });
});
