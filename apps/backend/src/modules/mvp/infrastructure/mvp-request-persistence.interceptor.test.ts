import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MvpRequestPersistenceInterceptor } from './mvp-request-persistence.interceptor.js';
import * as normalizedCollections from './normalized-collections.js';
import { READS_NORMALIZED } from './reads-normalized.decorator.js';
import { TenantTimezoneService } from '../../../infrastructure/tenant/tenant-timezone.service.js';

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
  return new MvpRequestPersistenceInterceptor(
    state,
    metrics,
    backend as never,
    tenantGateway,
    new TenantTimezoneService()
  );
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

describe('пометка @ReadsNormalized (Фаза 1, срез 1b)', () => {
  const req = { context: { tenantId: 'tenant-1', requestId: 'r', correlationId: 'c' } };

  function makeWithReflector(backend: TestBackend, collection: string | undefined) {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => (key === READS_NORMALIZED ? collection : undefined))
    } as never;
    return new MvpRequestPersistenceInterceptor(
      {} as never,
      { observeDuration: vi.fn(), incrementCounter: vi.fn() } as never,
      backend as never,
      { runExclusive: (_t: string, fn: () => unknown) => fn() } as never,
      new TenantTimezoneService(),
      reflector
    );
  }
  const ctxWithHandler = () =>
    ({
      getType: () => 'http' as const,
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => function handler() {},
      getClass: () => class Ctl {}
    }) as never;

  it('при включённом флаге помеченная ручка обходится без снимка: ни загрузки, ни сохранения', async () => {
    const spy = vi.spyOn(normalizedCollections, 'isNormalizedRead').mockReturnValue(true);
    try {
      const backend = new TestBackend();
      const interceptor = makeWithReflector(backend, 'groups');
      const result = await lastValueFrom(
        interceptor.intercept(ctxWithHandler(), { handle: () => of('rows') })
      );
      expect(result).toBe('rows');
      expect(backend.loadIntoState).not.toHaveBeenCalled();
      expect(backend.saveFromState).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('при выключенном флаге пометка ничего не меняет — снимок грузится и сохраняется', async () => {
    const spy = vi.spyOn(normalizedCollections, 'isNormalizedRead').mockReturnValue(false);
    try {
      const backend = new TestBackend();
      const interceptor = makeWithReflector(backend, 'groups');
      await lastValueFrom(interceptor.intercept(ctxWithHandler(), { handle: () => of('rows') }));
      expect(backend.loadIntoState).toHaveBeenCalledTimes(1);
      expect(backend.saveFromState).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('ручка без пометки и контекст без getHandler — как раньше', async () => {
    const spy = vi.spyOn(normalizedCollections, 'isNormalizedRead').mockReturnValue(true);
    try {
      const backend = new TestBackend();
      const interceptor = makeWithReflector(backend, undefined);
      await lastValueFrom(interceptor.intercept(makeCtx(req), { handle: () => of('rows') }));
      expect(backend.loadIntoState).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
