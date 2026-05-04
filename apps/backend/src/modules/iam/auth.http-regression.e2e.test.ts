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
  DB_MIGRATIONS_ENABLED: '',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

const parseErrorEnvelope = async (
  response: Response
): Promise<{ error: { code: string; message: string } }> => {
  const payload = (await response.json()) as {
    error: { code: string; message: string };
    meta: { requestId: string };
  };
  expect(payload).toHaveProperty('error.code');
  expect(payload).toHaveProperty('meta.requestId');
  return payload;
};

describe('IAM HTTP regressions (integration/e2e)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      throttlerImport,
      coreModuleImport,
      httpFilterImport,
      contextInterceptorImport,
      responseEnvelopeImport,
      authControllerImport,
      authServiceImport,
      iamServiceImport,
      permissionGuardImport,
      auditServiceImport,
      secretsServiceImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../core/core.module.js'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('./auth.controller.js'),
      import('./services/auth.service.js'),
      import('./services/iam.service.js'),
      import('./permission.guard.js'),
      import('../audit/audit.service.js'),
      import('../../infrastructure/secrets/secrets.service.js')
    ]);

    const { NestFactory } = nestjsCore;
    const { Controller, Get, Module, ValidationPipe } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { CoreModule } = coreModuleImport;
    const { HttpExceptionEnvelopeFilter } = httpFilterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = responseEnvelopeImport;
    const { AuthController } = authControllerImport;
    const { AuthService } = authServiceImport;
    const { IamService } = iamServiceImport;
    const { PermissionGuard } = permissionGuardImport;
    const { AuditService } = auditServiceImport;
    const { SecretsService } = secretsServiceImport;

    @Controller('__test')
    class TestEnvelopeController {
      @Get('ping')
      ping() {
        return { ok: true };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }), CoreModule],
      controllers: [AuthController, TestEnvelopeController],
      providers: [AuditService, IamService, AuthService, PermissionGuard, SecretsService]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule);
    created.useGlobalPipes(
      new ValidationPipe({ whitelist: false, transform: true, forbidUnknownValues: false })
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
  }, 120_000);

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

  it('rejects mismatched x-tenant-id when Bearer token is valid (JWT is authoritative)', async () => {
    const loginResponse = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo'
      },
      body: JSON.stringify({ login: 'tenant_admin', password: 'Password123!' })
    });
    expect(loginResponse.status).toBe(201);
    const loginPayload = (await loginResponse.json()) as {
      data: { accessToken: string };
    };

    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        authorization: `Bearer ${loginPayload.data.accessToken}`,
        'x-tenant-id': 'tenant_spoofed',
        'x-user-id': 'u_spoofed'
      }
    });
    expect(response.status).toBe(400);
    const payload = await parseErrorEnvelope(response);
    expect(payload.error.code).toBe('tenant_header_mismatch');
  });

  it('allows auth/me with valid Bearer and no x-tenant-id header', async () => {
    const loginResponse = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo'
      },
      body: JSON.stringify({ login: 'tenant_admin', password: 'Password123!' })
    });
    expect(loginResponse.status).toBe(201);
    const loginPayload = (await loginResponse.json()) as {
      data: { accessToken: string };
    };

    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${loginPayload.data.accessToken}` }
    });
    expect(response.status).toBe(200);
    const envelope = (await response.json()) as { data: { id: string; tenantId: string } };
    expect(envelope.data.id).toBe('u_tenant_admin');
    expect(envelope.data.tenantId).toBe('tenant_demo');
  });

  it('returns invalid_token for malformed bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        authorization: 'Bearer malformed.jwt.token',
        'x-tenant-id': 'tenant_demo',
        'x-user-id': 'u_tenant_admin'
      }
    });

    expect(response.status).toBe(401);
    const payload = await parseErrorEnvelope(response);
    expect(payload.error.code).toBe('invalid_token');
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

  it('returns session_inactive when session is revoked and protected route is requested', async () => {
    const loginResponse = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo'
      },
      body: JSON.stringify({ login: 'tenant_admin', password: 'Password123!' })
    });
    expect(loginResponse.status).toBe(201);
    const loginPayload = (await loginResponse.json()) as {
      data: { accessToken: string };
    };

    const { verifySignedAccessToken } = await import('./crypto.util.js');
    const claims = verifySignedAccessToken(
      loginPayload.data.accessToken,
      process.env.AUTH_JWT_SECRET!
    );

    const logoutResponse = await fetch(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${loginPayload.data.accessToken}`
      },
      body: JSON.stringify({ sessionId: claims.session_id })
    });
    expect(logoutResponse.status).toBe(201);

    const forbiddenResponse = await fetch(`${apiBaseUrl}/users`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${loginPayload.data.accessToken}`
      }
    });
    expect(forbiddenResponse.status).toBe(403);
    const forbiddenEnvelope = await parseErrorEnvelope(forbiddenResponse);
    expect(forbiddenEnvelope.error.code).toBe('session_inactive');
  });
});
