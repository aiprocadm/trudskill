import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MvpRequestPersistenceInterceptor } from './mvp-request-persistence.interceptor.js';

class TestBackend {
  loadIntoState = vi.fn().mockResolvedValue(undefined);
  saveFromState = vi.fn().mockResolvedValue(undefined);
}

function makeInterceptor(backend: TestBackend) {
  const state = {} as never;
  const metrics = {
    observeDuration: vi.fn(),
    incrementCounter: vi.fn()
  } as never;
  const tenantGateway = {
    runExclusive: (_t: string, fn: () => unknown) => fn()
  } as never;
  return new MvpRequestPersistenceInterceptor(state, metrics, backend as never, tenantGateway);
}

function makeCtx(req: object) {
  return {
    getType: () => 'http' as const,
    switchToHttp: () => ({ getRequest: () => req })
  } as never;
}

describe('MvpRequestPersistenceInterceptor', () => {
  let backend: TestBackend;
  let interceptor: MvpRequestPersistenceInterceptor;
  const req = {
    context: {
      tenantId: 'tenant-1',
      requestId: 'req-1',
      correlationId: 'corr-1'
    }
  };

  beforeEach(() => {
    backend = new TestBackend();
    interceptor = makeInterceptor(backend);
  });

  it('does not persist when the handler throws', async () => {
    const ctx = makeCtx(req);
    const next = { handle: () => throwError(() => new Error('boom')) } as never;

    await expect(lastValueFrom(interceptor.intercept(ctx, next))).rejects.toThrow('boom');

    expect(backend.loadIntoState).toHaveBeenCalledOnce();
    expect(backend.saveFromState).not.toHaveBeenCalled();
  });

  it('persists when the handler succeeds', async () => {
    const ctx = makeCtx(req);
    const next = { handle: () => of('ok') } as never;

    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    expect(result).toBe('ok');
    expect(backend.saveFromState).toHaveBeenCalledOnce();
  });
});
