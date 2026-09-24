import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentsRequestPersistenceInterceptor } from './documents-request-persistence.interceptor.js';
import { TenantTimezoneService } from '../../../infrastructure/tenant/tenant-timezone.service.js';
import * as normalizedCollections from '../../mvp/infrastructure/normalized-collections.js';
import { READS_NORMALIZED } from '../../mvp/infrastructure/reads-normalized.decorator.js';

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
  return new DocumentsRequestPersistenceInterceptor(
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

describe('DocumentsRequestPersistenceInterceptor', () => {
  let backend: TestBackend;
  let interceptor: DocumentsRequestPersistenceInterceptor;
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

  /* Фаза 1, срез 5b: пометка `@ReadsNormalized('generatedDocuments')` — снимок не грузится. */
  describe('пометка @ReadsNormalized', () => {
    function makeWithReflector(b: TestBackend, collection: string | undefined) {
      const reflector = {
        getAllAndOverride: vi.fn((key: string) =>
          key === READS_NORMALIZED && collection !== undefined ? collection.split(',') : undefined
        )
      } as never;
      return new DocumentsRequestPersistenceInterceptor(
        {} as never,
        { observeDuration: vi.fn(), incrementCounter: vi.fn() } as never,
        b as never,
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
        getClass: () => class Controller {}
      }) as never;

    it('при включённом флаге помеченная ручка обходится без снимка: ни загрузки, ни сохранения', async () => {
      const spy = vi
        .spyOn(normalizedCollections, 'isNormalizedRead')
        .mockImplementation((c) => c === 'generatedDocuments');
      try {
        const b = new TestBackend();
        const i = makeWithReflector(b, 'generatedDocuments');
        const result = await lastValueFrom(
          i.intercept(ctxWithHandler(), { handle: () => of('rows') })
        );
        expect(result).toBe('rows');
        expect(b.loadIntoState).not.toHaveBeenCalled();
        expect(b.saveFromState).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('при выключенном флаге пометка ничего не меняет — снимок грузится и сохраняется', async () => {
      const spy = vi.spyOn(normalizedCollections, 'isNormalizedRead').mockReturnValue(false);
      try {
        const b = new TestBackend();
        const i = makeWithReflector(b, 'generatedDocuments');
        await lastValueFrom(i.intercept(ctxWithHandler(), { handle: () => of('rows') }));
        expect(b.loadIntoState).toHaveBeenCalledOnce();
        expect(b.saveFromState).toHaveBeenCalledOnce();
      } finally {
        spy.mockRestore();
      }
    });

    it('без пометки и без Reflector — как раньше', async () => {
      const b = new TestBackend();
      const i = makeWithReflector(b, undefined);
      await lastValueFrom(i.intercept(ctxWithHandler(), { handle: () => of('rows') }));
      expect(b.loadIntoState).toHaveBeenCalledOnce();
      await lastValueFrom(
        makeInterceptor(b).intercept(makeCtx(req), { handle: () => of('x') } as never)
      );
      expect(b.loadIntoState).toHaveBeenCalledTimes(2);
    });
  });
});
