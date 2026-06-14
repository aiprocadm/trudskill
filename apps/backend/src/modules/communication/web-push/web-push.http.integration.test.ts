import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const requiredEnv: Record<string, string> = {
  NODE_ENV: 'test',
  BACKEND_PORT: '3001',
  API_PREFIX: '/api/v1',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio123',
  S3_BUCKET: 'test',
  AUTH_JWT_SECRET: 'secret_value_123',
  SESSION_SECRET: 'session_secret_123',
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  REALTIME_PUBLIC_URL: 'ws://localhost:3000',
  REALTIME_PUBLISH_KEY: 'test-realtime-publish-key',
  DB_MIGRATIONS_ENABLED: 'false',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

/**
 * Phase 10 Track C — permission boundary for the web-push self-service endpoints.
 * Mirrors mvp.http.integration.test.ts's stub-controller pattern. The key assertion:
 * the controller is TenantGuard-ONLY (no @RequirePermissions), so ANY authenticated
 * tenant user can subscribe/unsubscribe/list — there is no RBAC gate.
 */
describe('Web Push HTTP integration (TenantGuard-only boundary)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';
  let issueSignedAccessToken: (
    payload: { sub: string; tenant_id: string; session_id: string; roles: string[] },
    secret: string,
    ttlSeconds: number
  ) => string;

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      throttlerImport,
      filterImport,
      contextInterceptorImport,
      envelopeImport,
      tenantGuardImport,
      currentContextDecoratorImport,
      cryptoImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../../common/filters/http-exception.filter.js'),
      import('../../../common/interceptors/request-context.interceptor.js'),
      import('../../../common/interceptors/response-envelope.interceptor.js'),
      import('../../../common/guards/tenant.guard.js'),
      import('../../../common/decorators/current-context.decorator.js'),
      import('../../iam/crypto.util.js')
    ]);

    issueSignedAccessToken = cryptoImport.issueSignedAccessToken;

    const { NestFactory } = nestjsCore;
    const { Body, Controller, Delete, Get, Module, Post, UseGuards, ValidationPipe } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;
    const { TenantGuard } = tenantGuardImport;
    const { CurrentContext } = currentContextDecoratorImport;

    // In-memory subscription store, scoped by (tenant,user) — proves operations are user-scoped.
    const store: Array<{ tenantId: string; userId: string; endpoint: string }> = [];

    @Controller('web-push')
    @UseGuards(TenantGuard) // NOTE: no PermissionGuard / @RequirePermissions — self-service.
    class TestWebPushController {
      @Get('public-key')
      publicKey() {
        return { enabled: false, publicKey: null };
      }

      @Get('subscriptions')
      list(@CurrentContext() ctx: { tenantId?: string; userId?: string }) {
        return store.filter((s) => s.tenantId === ctx.tenantId && s.userId === ctx.userId);
      }

      @Post('subscribe')
      subscribe(
        @CurrentContext() ctx: { tenantId?: string; userId?: string },
        @Body() body: { endpoint: string }
      ) {
        store.push({ tenantId: ctx.tenantId!, userId: ctx.userId!, endpoint: body.endpoint });
        return { tenantId: ctx.tenantId, userId: ctx.userId, endpoint: body.endpoint };
      }

      @Delete('subscribe')
      unsubscribe(
        @CurrentContext() ctx: { tenantId?: string; userId?: string },
        @Body() body: { endpoint: string }
      ) {
        const idx = store.findIndex(
          (s) =>
            s.tenantId === ctx.tenantId && s.userId === ctx.userId && s.endpoint === body.endpoint
        );
        if (idx >= 0) store.splice(idx, 1);
        return { ok: true };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestWebPushController],
      providers: [TenantGuard]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule);
    created.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false })
    );
    created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    created.useGlobalInterceptors(
      new RequestContextInterceptor(),
      new ResponseEnvelopeInterceptor()
    );
    created.setGlobalPrefix((process.env.API_PREFIX ?? '/api/v1').replace(/^\//, ''));
    await created.listen(0, '127.0.0.1');

    const address = created.getHttpServer().address() as { port: number };
    apiBaseUrl = `http://127.0.0.1:${address.port}${process.env.API_PREFIX ?? '/api/v1'}`;
    app = created;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  function tokenFor(userId: string) {
    return issueSignedAccessToken(
      { sub: userId, tenant_id: 'tenant_demo', session_id: 's_active', roles: ['learner'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
  }

  it('returns 401 for POST /web-push/subscribe without a bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/web-push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
      body: JSON.stringify({ endpoint: 'https://push/a', keys: { p256dh: 'a', auth: 'b' } })
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('auth_required');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('allows ANY authenticated tenant user to subscribe (no RBAC gate)', async () => {
    const response = await fetch(`${apiBaseUrl}/web-push/subscribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${tokenFor('u_learner_1')}`
      },
      body: JSON.stringify({ endpoint: 'https://push/a', keys: { p256dh: 'a', auth: 'b' } })
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { userId: string; endpoint: string } };
    expect(payload.data.userId).toBe('u_learner_1');
    expect(payload.data.endpoint).toBe('https://push/a');
  });

  it('public-key is reachable by an authenticated user and reflects disabled push', async () => {
    const response = await fetch(`${apiBaseUrl}/web-push/public-key`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${tokenFor('u_learner_1')}` }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { enabled: boolean; publicKey: string | null };
    };
    expect(payload.data).toEqual({ enabled: false, publicKey: null });
  });

  it('list is scoped to the requesting user', async () => {
    // u_learner_1 already subscribed https://push/a above; a different user sees nothing.
    const otherUser = await fetch(`${apiBaseUrl}/web-push/subscriptions`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${tokenFor('u_learner_2')}` }
    });
    expect(otherUser.status).toBe(200);
    expect((await otherUser.json()).data).toEqual([]);

    const owner = await fetch(`${apiBaseUrl}/web-push/subscriptions`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${tokenFor('u_learner_1')}` }
    });
    expect((await owner.json()).data).toHaveLength(1);
  });
});
