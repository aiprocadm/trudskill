import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Phase 3 Plan B — HTTP integration boundary tests для НОВЫХ learner test-player endpoints.
 *
 * Stub-controller паттерн по образцу `assessment-admin.http.integration.test.ts`. Запускать
 * через `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/test-player.http.integration.test.ts --no-file-parallelism`
 * чтобы избежать падения NestJS worker pool на Cyrillic пути (см. CLAUDE.md Gotchas).
 *
 * Проверяемые endpoints (новые в Phase 3 Plan B):
 *  - GET /attempts/:id/questions   → assessment.attempts.take
 *  - GET /me/tests                 → assessment.tests.read
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

describe('Phase 3 Plan B — test-player HTTP boundary', () => {
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
    resolvePermissions: vi.fn().mockResolvedValue(['assessment.attempts.take'])
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
    class TestPlayerController {
      // Phase 3 Plan B — GET /attempts/:id/questions (answer-safe)
      @Get('attempts/:id/questions')
      @RequirePermissions('assessment.attempts.take')
      getAttemptQuestions(@CurrentContext() c: { tenantId?: string }, @Param('id') id: string) {
        return [
          {
            id: 'q1',
            type: 'single_choice',
            title: 'Q',
            score: 2,
            options: [{ id: 'opt1', text: 'A', sortOrder: 0 }],
            attemptId: id,
            tenantId: c.tenantId
          }
        ];
      }

      // Phase 3 Plan B — GET /me/tests
      @Get('me/tests')
      @RequirePermissions('assessment.tests.read')
      listMyTests(@CurrentContext() c: { tenantId?: string }) {
        return [
          {
            testId: 'test_1',
            title: 'Exam',
            courseId: 'course_1',
            enrollmentId: 'enr_1',
            status: 'not_started',
            attemptsUsed: 0,
            attemptLimit: 2,
            maxScore: 2,
            tenantId: c.tenantId
          }
        ];
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestPlayerController],
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

  function learnerToken(perms: string[]) {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(perms);
    return issueSignedAccessToken(
      {
        sub: 'u_learner',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['learner']
      },
      process.env.AUTH_JWT_SECRET ?? '',
      300
    );
  }

  // ---------- GET /attempts/:id/questions ----------
  it('GET /attempts/:id/questions → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/questions`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(401);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('auth_required');
  });

  it('GET /attempts/:id/questions → permission_denied without attempts.take', async () => {
    const token = learnerToken(['assessment.attempts.read']);
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/questions`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(403);
    const p = (await r.json()) as { error: { code: string } };
    expect(p.error.code).toBe('permission_denied');
  });

  it('GET /attempts/:id/questions → success envelope, answer-safe shape', async () => {
    const token = learnerToken(['assessment.attempts.take']);
    const r = await fetch(`${apiBaseUrl}/attempts/att_1/questions`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      data: Array<{ id: string; options: Array<Record<string, unknown>> }>;
      meta: { requestId: string; timestamp: string };
    };
    expect(p.data).toHaveLength(1);
    expect(p.data[0].id).toBe('q1');
    expect(Object.keys(p.data[0])).not.toContain('explanation');
    expect(Object.keys(p.data[0].options[0])).not.toContain('isCorrect');
    expect(p.meta.requestId).toBeTruthy();
  });

  // ---------- GET /me/tests ----------
  it('GET /me/tests → auth_required without bearer', async () => {
    const r = await fetch(`${apiBaseUrl}/me/tests`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(401);
  });

  it('GET /me/tests → permission_denied without tests.read', async () => {
    const token = learnerToken(['assessment.attempts.take']);
    const r = await fetch(`${apiBaseUrl}/me/tests`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(403);
  });

  it('GET /me/tests → success envelope with learner summary', async () => {
    const token = learnerToken(['assessment.tests.read']);
    const r = await fetch(`${apiBaseUrl}/me/tests`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant_demo' }
    });
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      data: Array<{ testId: string; status: string; maxScore: number }>;
      meta: { requestId: string };
    };
    expect(p.data[0].testId).toBe('test_1');
    expect(p.data[0].status).toBe('not_started');
    expect(p.data[0].maxScore).toBe(2);
  });
});
