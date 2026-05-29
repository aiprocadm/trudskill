import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Phase 3 Plan C — HTTP integration boundary tests for the 4 new endpoints.
 *
 * Stub-controller pattern mirroring `test-player.http.integration.test.ts`.
 * Run in isolation:
 *   pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/plan-c.http.integration.test.ts --no-file-parallelism
 *
 * Endpoints tested:
 *  - POST /assignment-submissions/:id/upload-url  → assessment.submissions.submit
 *  - GET  /assignment-submissions/:id/file-url    → assessment.assignments.read
 *  - POST /assignment-submissions/:id/return      → assessment.reviews.review
 *  - POST /attempts/:id/complete-review           → assessment.reviews.review
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
  DB_MIGRATIONS_ENABLED: '',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

describe('Phase 3 Plan C — HTTP boundary (upload-url / file-url / return / complete-review)', () => {
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
    resolvePermissions: vi.fn().mockResolvedValue(['assessment.submissions.submit'])
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
      Controller,
      ForbiddenException,
      Get,
      Inject,
      Injectable,
      Module,
      Param,
      Post,
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
        const hasAll = required.every((p: string) => resolved.includes(p));
        if (!hasAll)
          throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
        return true;
      }
    }

    @Controller()
    @UseGuards(TenantGuard, TestPermissionGuard)
    class PlanCStubController {
      // POST /assignment-submissions/:id/upload-url
      @Post('assignment-submissions/:id/upload-url')
      @RequirePermissions('assessment.submissions.submit')
      createUploadUrl(@CurrentContext() c: { tenantId?: string }, @Param('id') id: string) {
        return {
          fileId: `file_${id}`,
          uploadUrl: `https://minio.local/PUT/${id}`,
          storageKey: `submissions/${c.tenantId}/${id}`,
          expiresInSeconds: 900
        };
      }

      // GET /assignment-submissions/:id/file-url
      @Get('assignment-submissions/:id/file-url')
      @RequirePermissions('assessment.assignments.read')
      getFileUrl(@CurrentContext() c: { tenantId?: string }, @Param('id') id: string) {
        return { url: `https://minio.local/GET/${id}?tenant=${c.tenantId}` };
      }

      // POST /assignment-submissions/:id/return
      @Post('assignment-submissions/:id/return')
      @RequirePermissions('assessment.reviews.review')
      returnSubmission(@Param('id') id: string) {
        return { id, status: 'returned' };
      }

      // POST /attempts/:id/complete-review
      @Post('attempts/:id/complete-review')
      @RequirePermissions('assessment.reviews.review')
      completeReview(@Param('id') id: string) {
        return { id, status: 'finished', score: 4 };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [PlanCStubController],
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

  function tokenWithPerms(perms: string[]) {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(perms);
    return issueSignedAccessToken(
      {
        sub: 'u_actor',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['reviewer']
      },
      process.env.AUTH_JWT_SECRET ?? '',
      300
    );
  }

  // ---------- POST /assignment-submissions/:id/upload-url ----------
  it('POST /assignment-submissions/:id/upload-url → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/upload-url`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({
        originalName: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100
      })
    });
    expect(r.status).toBe(401);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('auth_required');
  });

  it('POST /assignment-submissions/:id/upload-url → permission_denied without submissions.submit', async () => {
    const token = tokenWithPerms(['assessment.assignments.read']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/upload-url`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        originalName: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100
      })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('POST /assignment-submissions/:id/upload-url → 200 success envelope', async () => {
    const token = tokenWithPerms(['assessment.submissions.submit']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/upload-url`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        originalName: 'f.pdf',
        contentType: 'application/pdf',
        sizeBytes: 100
      })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as {
      data: { fileId: string; uploadUrl: string; expiresInSeconds: number };
      meta: { requestId: string };
    };
    expect(p.data.fileId).toBe('file_sub_1');
    expect(p.data.uploadUrl).toContain('minio.local');
    expect(p.data.expiresInSeconds).toBeGreaterThan(0);
    expect(p.meta.requestId).toBeTruthy();
  });

  // ---------- GET /assignment-submissions/:id/file-url ----------
  it('GET /assignment-submissions/:id/file-url → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/file-url`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(401);
  });

  it('GET /assignment-submissions/:id/file-url → permission_denied without assignments.read', async () => {
    const token = tokenWithPerms(['assessment.submissions.submit']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/file-url`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('GET /assignment-submissions/:id/file-url → 200 success envelope with url', async () => {
    const token = tokenWithPerms(['assessment.assignments.read']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/file-url`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as { data: { url: string }; meta: { requestId: string } };
    expect(p.data.url).toContain('minio.local');
    expect(p.meta.requestId).toBeTruthy();
  });

  // ---------- POST /assignment-submissions/:id/return ----------
  it('POST /assignment-submissions/:id/return → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/return`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'rework please' })
    });
    expect(r.status).toBe(401);
  });

  it('POST /assignment-submissions/:id/return → permission_denied without reviews.review', async () => {
    const token = tokenWithPerms(['assessment.assignments.read']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/return`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ comment: 'rework please' })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('POST /assignment-submissions/:id/return → 200 success envelope', async () => {
    const token = tokenWithPerms(['assessment.reviews.review']);
    const r = await fetch(`${apiBaseUrl}/assignment-submissions/sub_1/return`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ comment: 'rework please' })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as { data: { status: string }; meta: { requestId: string } };
    expect(p.data.status).toBe('returned');
    expect(p.meta.requestId).toBeTruthy();
  });

  // ---------- POST /attempts/:id/complete-review ----------
  it('POST /attempts/:id/complete-review → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/complete-review`, {
      method: 'POST',
      headers: { 'x-tenant-id': 'tenant_demo', 'content-type': 'application/json' },
      body: JSON.stringify({ answerScores: [{ questionId: 'q1', score: 4 }] })
    });
    expect(r.status).toBe(401);
  });

  it('POST /attempts/:id/complete-review → permission_denied without reviews.review', async () => {
    const token = tokenWithPerms(['assessment.attempts.take']);
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/complete-review`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ answerScores: [{ questionId: 'q1', score: 4 }] })
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('POST /attempts/:id/complete-review → 200 success envelope', async () => {
    const token = tokenWithPerms(['assessment.reviews.review']);
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/complete-review`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant_demo',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        answerScores: [{ questionId: 'q1', score: 4 }],
        reviewComment: 'well done'
      })
    });
    expect(r.status).toBe(201);
    const p = (await r.json()) as {
      data: { id: string; status: string; score: number };
      meta: { requestId: string };
    };
    expect(p.data.id).toBe('att_1');
    expect(p.data.status).toBe('finished');
    expect(p.data.score).toBe(4);
    expect(p.meta.requestId).toBeTruthy();
  });
});
