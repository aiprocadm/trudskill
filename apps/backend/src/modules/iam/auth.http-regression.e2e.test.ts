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
  DB_MIGRATIONS_ENABLED: '',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

const parseErrorEnvelope = async (response: Response): Promise<{ error: { code: string; message: string } }> => {
  const payload = (await response.json()) as { error: { code: string; message: string }; meta: { requestId: string } };
  expect(payload).toHaveProperty('error.code');
  expect(payload).toHaveProperty('meta.requestId');
  return payload;
};

describe('IAM HTTP regressions (integration/e2e)', () => {
  let app: { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } } | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      coreModuleImport,
      httpFilterImport,
      contextInterceptorImport,
      responseEnvelopeImport,
      authControllerImport,
      authServiceImport,
      iamServiceImport,
      permissionGuardImport,
      auditServiceImport
    ] =
      await Promise.all([
        import('@nestjs/core'),
        import('@nestjs/common'),
        import('../core/core.module.js'),
        import('../../common/filters/http-exception.filter.js'),
        import('../../common/interceptors/request-context.interceptor.js'),
        import('../../common/interceptors/response-envelope.interceptor.js'),
        import('./auth.controller.js'),
        import('./services/auth.service.js'),
        import('./services/iam.service.js'),
        import('./permission.guard.js'),
        import('../audit/audit.service.js')
      ]);

    const { NestFactory } = nestjsCore;
    const { Controller, Get, Module, ValidationPipe } = nestjsCommon;
    const { CoreModule } = coreModuleImport;
    const { HttpExceptionEnvelopeFilter } = httpFilterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = responseEnvelopeImport;
    const { AuthController } = authControllerImport;
    const { AuthService } = authServiceImport;
    const { IamService } = iamServiceImport;
    const { PermissionGuard } = permissionGuardImport;
    const { AuditService } = auditServiceImport;

    @Controller('__test')
    class TestEnvelopeController {
      @Get('ping')
      ping() {
        return { ok: true };
      }
    }

    @Module({
      imports: [CoreModule],
      controllers: [AuthController, TestEnvelopeController],
      providers: [AuditService, IamService, AuthService, PermissionGuard]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule);
    created.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true, forbidUnknownValues: false }));
    created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    created.useGlobalInterceptors(new RequestContextInterceptor(), new ResponseEnvelopeInterceptor());
    created.setGlobalPrefix((process.env.API_PREFIX ?? '/api/v1').replace(/^\//, ''));
    await created.listen(0, '127.0.0.1');

    const address = created.getHttpServer().address() as { port: number };
    apiBaseUrl = `http://127.0.0.1:${address.port}${process.env.API_PREFIX ?? '/api/v1'}`;
    app = created;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('rejects header-only identity without Bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { 'x-tenant-id': 'tenant_demo', 'x-user-id': 'u_tenant_admin' }
    });

    expect(response.status).toBe(401);
    const payload = await parseErrorEnvelope(response);
    expect(payload.error.code).toBe('auth_required');
  });

  it('keeps success and error envelopes compliant with API contract', async () => {
    const pingResponse = await fetch(`${apiBaseUrl}/__test/ping`);
    expect(pingResponse.status).toBe(200);
    const pingEnvelope = (await pingResponse.json()) as {
      data: { ok: boolean };
      meta: { requestId: string; correlationId: string; timestamp: string };
      error?: unknown;
    };
    expect(pingEnvelope).toHaveProperty('data');
    expect(pingEnvelope).toHaveProperty('meta.requestId');
    expect(pingEnvelope.error).toBeUndefined();
    expect(pingEnvelope.data.ok).toBe(true);

    const unauthorizedResponse = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { 'x-tenant-id': 'tenant_demo', 'x-user-id': 'u_tenant_admin' }
    });
    expect(unauthorizedResponse.status).toBe(401);
    const unauthorizedEnvelope = (await unauthorizedResponse.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
      data?: unknown;
    };
    expect(unauthorizedEnvelope).toHaveProperty('error.code');
    expect(unauthorizedEnvelope).toHaveProperty('meta.requestId');
    expect(unauthorizedEnvelope.data).toBeUndefined();
  });
});
