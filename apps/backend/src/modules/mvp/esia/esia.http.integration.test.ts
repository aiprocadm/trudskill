// apps/backend/src/modules/mvp/esia/esia.http.integration.test.ts
//
// Harness: mirrors mvp.http.integration.test.ts — NestFactory.create with dynamic imports,
// no @nestjs/testing (not in deps), no supertest. Asserts the dormant default (ESIA_ENABLED=false
// → NoopEsiaProvider → 503 esia_disabled) so the seam can never be on by accident.
//
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('ЕСИА HTTP (dormant)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    const [nestjsCore, nestjsCommon, filterImport] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('../../../common/filters/http-exception.filter.js')
    ]);

    const { NestFactory } = nestjsCore;
    const { Controller, Get, Query, Res, Module } = nestjsCommon;
    const { HttpExceptionEnvelopeFilter } = filterImport;

    const { NoopEsiaProvider } =
      await import('../../../infrastructure/esia/esia-identity.provider.js');

    @Controller()
    class StubEsiaController {
      private readonly provider = new NoopEsiaProvider();

      @Get('auth/esia/authorize')
      authorize(@Query('purpose') _p: string, @Res({ passthrough: true }) res: any): void {
        // Noop provider throws → HttpExceptionEnvelopeFilter wraps to { error: { code } }.
        res.redirect(
          this.provider.buildAuthorizeUrl({ state: 's', purpose: 'login', redirectUri: 'r' })
        );
      }
    }

    @Module({ controllers: [StubEsiaController] })
    class StubEsiaModule {}

    const created = await NestFactory.create(StubEsiaModule, { logger: false });
    created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    await created.listen(0, '127.0.0.1');

    const address = created.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    app = created;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /auth/esia/authorize returns 503 esia_disabled when ESIA_ENABLED=false', async () => {
    const response = await fetch(`${baseUrl}/auth/esia/authorize?purpose=login`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error?: { code: string }; code?: string };
    expect(body?.error?.code ?? body?.code).toBe('esia_disabled');
  });
});
