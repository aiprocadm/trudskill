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
    const [nestjsCore, nestjsCommon, iamModuleImport, coreModuleImport, httpFilterImport, contextInterceptorImport, responseEnvelopeImport] =
      await Promise.all([
        import('@nestjs/core'),
        import('@nestjs/common'),
        import('./iam.module.js'),
        import('../core/core.module.js'),
        import('../../common/filters/http-exception.filter.js'),
        import('../../common/interceptors/request-context.interceptor.js'),
        import('../../common/interceptors/response-envelope.interceptor.js')
      ]);

    const { NestFactory } = nestjsCore;
    const { Module, ValidationPipe } = nestjsCommon;
    const { IamModule } = iamModuleImport;
    const { CoreModule } = coreModuleImport;
    const { HttpExceptionEnvelopeFilter } = httpFilterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = responseEnvelopeImport;

    @Module({ imports: [CoreModule, IamModule] })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule);
    created.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
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
});
