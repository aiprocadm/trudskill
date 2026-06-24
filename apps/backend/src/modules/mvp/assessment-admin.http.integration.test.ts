import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Phase 3 Plan A — HTTP integration boundary tests для НОВЫХ admin assessment endpoints.
 *
 * Этот файл — stub-controller паттерн по образцу `mvp.http.integration.test.ts`. Запускать
 * через `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/assessment-admin.http.integration.test.ts --no-file-parallelism`
 * чтобы избежать падения NestJS worker pool на Cyrillic пути (см. CLAUDE.md Gotchas).
 *
 * Проверяемые endpoints (новые в Phase 3 Plan A):
 *  - PUT  /tests/:id/rules                         → assessment.tests.write
 *  - POST /tests/:id/questions/single              → assessment.tests.write
 *  - DELETE /tests/:id/questions/:questionId       → assessment.tests.write
 *  - PATCH  /tests/:id/questions/:questionId       → assessment.tests.write
 *  - GET  /reviewer/queue                          → assessment.reviews.review
 *
 * На каждый — auth_required + permission_denied + happy success-envelope shape.
 */

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

describe('Phase 3 Plan A — assessment admin HTTP boundary', () => {
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
  const iamServiceMock = {
    resolvePermissions: vi.fn().mockResolvedValue(['assessment.tests.write'])
  };

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

    const { NestFactory, Reflector } = nestjsCore;
    const {
      Body,
      Controller,
      Delete,
      ForbiddenException,
      Get,
      Inject,
      Injectable,
      Module,
      Param,
      Patch,
      Post,
      Put,
      UseGuards,
      ValidationPipe
    } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;
    const { TenantGuard } = tenantGuardImport;
    const { RequirePermissions, REQUIRED_PERMISSIONS } = permissionDecoratorImport;
    const { CurrentContext } = currentContextDecoratorImport;

    @Injectable()
    class TestPermissionGuard {
      constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
      async canActivate(context: {
        getHandler: () => unknown;
        getClass: () => unknown;
        switchToHttp: () => {
          getRequest: () => {
            context?: { tenantId?: string; userId?: string; sessionId?: string };
          };
        };
      }) {
        const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
          context.getHandler(),
          context.getClass()
        ]);
        if (!required || required.length === 0) return true;
        const request = context.switchToHttp().getRequest();
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
        if (!sessionActive)
          throw new ForbiddenException({ code: 'session_inactive', message: 'Session inactive' });
        const resolved = await iamServiceMock.resolvePermissions(
          requestContext.tenantId,
          requestContext.userId
        );
        const hasAll = required.every((p) => resolved.includes(p));
        if (!hasAll)
          throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
        return true;
      }
    }

    @Controller()
    @UseGuards(TenantGuard, TestPermissionGuard)
    class TestAdminAssessmentController {
      // Phase 3 Plan A — PUT /tests/:id/rules
      @Put('tests/:id/rules')
      @RequirePermissions('assessment.tests.write')
      putRules(
        @CurrentContext() c: { tenantId?: string },
        @Param('id') id: string,
        @Body() body: { attemptLimit?: number; passingScore?: number }
      ) {
        return {
          id,
          tenantId: c.tenantId,
          rules: { attemptLimit: body.attemptLimit, passingScore: body.passingScore }
        };
      }

      // Phase 3 Plan A — POST /tests/:id/questions/single
      @Post('tests/:id/questions/single')
      @RequirePermissions('assessment.tests.write')
      addSingleQuestion(
        @CurrentContext() c: { tenantId?: string },
        @Param('id') id: string,
        @Body() body: { questionId: string; sortOrder?: number }
      ) {
        return {
          testId: id,
          tenantId: c.tenantId,
          questionId: body.questionId,
          sortOrder: body.sortOrder ?? 0
        };
      }

      // Phase 3 Plan A — DELETE /tests/:id/questions/:questionId
      @Delete('tests/:id/questions/:questionId')
      @RequirePermissions('assessment.tests.write')
      removeQuestion(
        @CurrentContext() c: { tenantId?: string },
        @Param('id') id: string,
        @Param('questionId') questionId: string
      ) {
        return { testId: id, tenantId: c.tenantId, questionId, removed: true };
      }

      // Phase 3 Plan A — PATCH /tests/:id/questions/:questionId (reorder)
      @Patch('tests/:id/questions/:questionId')
      @RequirePermissions('assessment.tests.write')
      reorderQuestion(
        @CurrentContext() c: { tenantId?: string },
        @Param('id') id: string,
        @Param('questionId') questionId: string,
        @Body() body: { sortOrder: number }
      ) {
        return {
          testId: id,
          tenantId: c.tenantId,
          questionId,
          sortOrder: body.sortOrder
        };
      }

      // Phase 3 Plan A — GET /reviewer/queue
      @Get('reviewer/queue')
      @RequirePermissions('assessment.reviews.review')
      reviewerQueue(@CurrentContext() c: { tenantId?: string }) {
        return {
          tenantId: c.tenantId,
          pendingAttempts: [],
          pendingSubmissions: []
        };
      }

      // Wave 1 Plan 2 — POST /attempts/request-pre-exam-token
      @Post('attempts/request-pre-exam-token')
      @RequirePermissions('assessment.attempts.take')
      requestPreExamToken(@CurrentContext() _c: { tenantId?: string }) {
        return { delivered: true, alreadyVerified: false };
      }

      // Wave 1 Plan 2 — POST /attempts/verify-pre-exam-token
      @Post('attempts/verify-pre-exam-token')
      @RequirePermissions('assessment.attempts.take')
      verifyPreExamToken(@CurrentContext() _c: { tenantId?: string }) {
        return { verified: true };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestAdminAssessmentController],
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

  function adminToken(perms: string[] = ['assessment.tests.write']) {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(perms);
    return issueSignedAccessToken(
      {
        sub: 'u_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['admin']
      },
      process.env.AUTH_JWT_SECRET ?? '',
      300
    );
  }

  // ---------- PUT /tests/:id/rules ----------
  it('PUT /tests/:id/rules → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/tests/test_1/rules`, {
      method: 'PUT',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({ attemptLimit: 2 })
    });
    expect(r.status).toBe(401);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('auth_required');
  });

  it('PUT /tests/:id/rules → permission_denied without tests.write', async () => {
    const token = adminToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/tests/test_1/rules`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ attemptLimit: 2 })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('PUT /tests/:id/rules → success envelope shape', async () => {
    const token = adminToken();
    const r = await fetch(`${apiBaseUrl}/tests/test_1/rules`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ attemptLimit: 2, passingScore: 0.7 })
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      data: { id: string; tenantId: string; rules: { attemptLimit: number } };
      meta: { requestId: string; timestamp: string };
    };
    expect(p.data.id).toBe('test_1');
    expect(p.data.tenantId).toBe('tenant_demo');
    expect(p.data.rules.attemptLimit).toBe(2);
    expect(p.meta.requestId).toBeTruthy();
    expect(p.meta.timestamp).toBeTruthy();
  });

  // ---------- POST /tests/:id/questions/single ----------
  it('POST /tests/:id/questions/single → permission_denied without tests.write', async () => {
    const token = adminToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/single`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ questionId: 'q1' })
    });
    expect(r.status).toBe(403);
  });

  it('POST /tests/:id/questions/single → returns envelope with question data', async () => {
    const token = adminToken();
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/single`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ questionId: 'q1', sortOrder: 5 })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as {
      data: { testId: string; questionId: string; sortOrder: number };
      meta: { requestId: string };
    };
    expect(p.data.questionId).toBe('q1');
    expect(p.data.sortOrder).toBe(5);
  });

  // ---------- DELETE /tests/:id/questions/:questionId ----------
  it('DELETE /tests/:id/questions/:questionId → permission_denied without tests.write', async () => {
    const token = adminToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/q1`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(403);
  });

  it('DELETE /tests/:id/questions/:questionId → success returns removed:true', async () => {
    const token = adminToken();
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/q1`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      data: { removed: boolean; questionId: string };
      meta: { requestId: string };
    };
    expect(p.data.removed).toBe(true);
    expect(p.data.questionId).toBe('q1');
  });

  // ---------- PATCH /tests/:id/questions/:questionId (reorder) ----------
  it('PATCH /tests/:id/questions/:questionId → permission_denied without tests.write', async () => {
    const token = adminToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/q1`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ sortOrder: 3 })
    });
    expect(r.status).toBe(403);
  });

  it('PATCH /tests/:id/questions/:questionId → reorder returns new sortOrder', async () => {
    const token = adminToken();
    const r = await fetch(`${apiBaseUrl}/tests/test_1/questions/q1`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ sortOrder: 3 })
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as { data: { sortOrder: number } };
    expect(p.data.sortOrder).toBe(3);
  });

  // ---------- GET /reviewer/queue ----------
  it('GET /reviewer/queue → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/reviewer/queue`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(401);
  });

  it('GET /reviewer/queue → permission_denied without reviews.review', async () => {
    const token = adminToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/reviewer/queue`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(403);
  });

  it('GET /reviewer/queue → success envelope with empty queue (Plans B+C runtime)', async () => {
    const token = adminToken(['assessment.reviews.review']);
    const r = await fetch(`${apiBaseUrl}/reviewer/queue`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      data: { pendingAttempts: unknown[]; pendingSubmissions: unknown[] };
      meta: { requestId: string };
    };
    expect(p.data.pendingAttempts).toEqual([]);
    expect(p.data.pendingSubmissions).toEqual([]);
  });

  // ---------- POST /attempts/request-pre-exam-token (Wave 1 Plan 2) ----------
  it('POST /attempts/request-pre-exam-token → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/attempts/request-pre-exam-token`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({ testId: 't1', enrollmentId: 'e1', attemptId: 'a1' })
    });
    expect(r.status).toBe(401);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('auth_required');
  });

  it('POST /attempts/request-pre-exam-token → 403 without assessment.attempts.take', async () => {
    const token = adminToken(['assessment.tests.write']);
    const r = await fetch(`${apiBaseUrl}/attempts/request-pre-exam-token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ testId: 't1', enrollmentId: 'e1', attemptId: 'a1' })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('POST /attempts/request-pre-exam-token → 201 + envelope with assessment.attempts.take', async () => {
    const token = adminToken(['assessment.attempts.take']);
    const r = await fetch(`${apiBaseUrl}/attempts/request-pre-exam-token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ testId: 't1', enrollmentId: 'e1', attemptId: 'a1' })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as {
      data: { delivered: boolean; alreadyVerified: boolean };
      meta: { requestId: string; timestamp: string };
    };
    expect(p.data.delivered).toBe(true);
    expect(p.data.alreadyVerified).toBe(false);
    expect(p.meta.requestId).toBeTruthy();
    expect(p.meta.timestamp).toBeTruthy();
  });

  // ---------- POST /attempts/verify-pre-exam-token (Wave 1 Plan 2) ----------
  it('POST /attempts/verify-pre-exam-token → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/attempts/verify-pre-exam-token`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'abc123' })
    });
    expect(r.status).toBe(401);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('auth_required');
  });

  it('POST /attempts/verify-pre-exam-token → 403 without assessment.attempts.take', async () => {
    const token = adminToken(['assessment.tests.write']);
    const r = await fetch(`${apiBaseUrl}/attempts/verify-pre-exam-token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ token: 'abc123' })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('POST /attempts/verify-pre-exam-token → 201 + envelope with assessment.attempts.take', async () => {
    const token = adminToken(['assessment.attempts.take']);
    const r = await fetch(`${apiBaseUrl}/attempts/verify-pre-exam-token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ token: 'abc123' })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as {
      data: { verified: boolean };
      meta: { requestId: string; timestamp: string };
    };
    expect(p.data.verified).toBe(true);
    expect(p.meta.requestId).toBeTruthy();
    expect(p.meta.timestamp).toBeTruthy();
  });
});
