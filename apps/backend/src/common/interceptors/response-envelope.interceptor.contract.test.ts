import { describe, expect, it } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
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

    const wrapped = await firstValueFrom(interceptor.intercept(executionContext, { handle: () => of({ ok: true }) } as never));

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
});
