import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
  DB_MIGRATIONS_ENABLED: '',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) process.env[key] = value;

describe('Integrations HTTP integration (permission boundaries)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';
  let issueSignedAccessToken: (
    payload: { sub: string; tenant_id: string; session_id: string; roles: string[] },
    secret: string,
    ttlSeconds: number
  ) => string;

  const authServiceMock = { isSessionActive: vi.fn().mockResolvedValue(true) };
  const iamServiceMock = { resolvePermissions: vi.fn().mockResolvedValue(['integrations.read']) };

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      throttlerImport,
      filterImport,
      contextInterceptorImport,
      envelopeImport,
      tenantGuardImport,
      permissionDecoratorImport,
      currentContextDecoratorImport,
      cryptoImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('../../common/guards/tenant.guard.js'),
      import('../iam/permission.decorator.js'),
      import('../../common/decorators/current-context.decorator.js'),
      import('../iam/crypto.util.js')
    ]);

    issueSignedAccessToken = cryptoImport.issueSignedAccessToken;

    const { NestFactory } = nestjsCore;
    const {
      Controller,
      ForbiddenException,
      Get,
      Injectable,
      Module,
      Post,
      UseGuards,
      ValidationPipe
    } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;
    const { TenantGuard } = tenantGuardImport;
    const { RequirePermissions } = permissionDecoratorImport;
    const { CurrentContext } = currentContextDecoratorImport;

    @Injectable()
    class TestPermissionGuard {
      async canActivate(context: {
        switchToHttp: () => {
          getRequest: () => {
            method?: string;
            context?: { tenantId?: string; userId?: string; sessionId?: string };
          };
        };
      }) {
        const request = context.switchToHttp().getRequest();
        const required = request.method === 'POST' ? ['integrations.write'] : ['integrations.read'];
        const requestContext = request.context;
        if (!requestContext?.tenantId || !requestContext.userId || !requestContext.sessionId) {
          throw new ForbiddenException({
            code: 'auth_required',
            message: 'Authentication required'
          });
        }
        const sessionActive = await authServiceMock.isSessionActive(
          requestContext.tenantId,
          requestContext.userId,
          requestContext.sessionId
        );
        if (!sessionActive) {
          throw new ForbiddenException({
            code: 'session_inactive',
            message: 'Session is inactive or revoked'
          });
        }
        const resolved = await iamServiceMock.resolvePermissions(
          requestContext.tenantId,
          requestContext.userId
        );
        if (!required.every((permission) => resolved.includes(permission))) {
          throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
        }
        return true;
      }
    }

    @Controller()
    @UseGuards(TenantGuard)
    class TestIntegrationsController {
      @Get('integrations/providers')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('integrations.read')
      providers(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ code: 'sbis', tenantId: context.tenantId, name: 'СБИС' }] };
      }

      @Post('integrations/providers/sbis/sync')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('integrations.write')
      sync() {
        return { status: 'queued' };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestIntegrationsController],
      providers: [TenantGuard, TestPermissionGuard]
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

  it('returns auth_required without bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/integrations/providers`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('auth_required');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for write endpoint with read-only permissions', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['integrations.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_integrator',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/integrations/providers/sbis/sync`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns session_inactive when session is revoked', async () => {
    authServiceMock.isSessionActive.mockResolvedValueOnce(false);
    const token = issueSignedAccessToken(
      {
        sub: 'u_integrator',
        tenant_id: 'tenant_demo',
        session_id: 's_revoked',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/integrations/providers`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('session_inactive');
    expect(payload.meta.requestId).toBeTruthy();
  });
});
