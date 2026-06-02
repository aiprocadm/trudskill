import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('MVP HTTP integration (permission boundaries)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';
  let issueSignedAccessToken: (
    payload: {
      sub: string;
      tenant_id: string;
      session_id: string;
      roles: string[];
    },
    secret: string,
    ttlSeconds: number
  ) => string;

  const authServiceMock = {
    isSessionActive: vi.fn().mockResolvedValue(true)
  };
  const iamServiceMock = {
    resolvePermissions: vi.fn().mockResolvedValue(['courses.read'])
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
      ForbiddenException,
      Get,
      Inject,
      Injectable,
      Module,
      Patch,
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

        if (!required || required.length === 0) {
          return true;
        }
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
        const hasAll = required.every((permission) => resolved.includes(permission));
        if (!hasAll) {
          throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
        }
        return true;
      }
    }

    @Controller()
    @UseGuards(TenantGuard, TestPermissionGuard)
    class TestMvpController {
      @Get('courses')
      @RequirePermissions('courses.read')
      listCourses(@CurrentContext() context: { tenantId?: string }) {
        return {
          items: [{ id: 'course_1', tenantId: context.tenantId, title: 'Курс по безопасности' }]
        };
      }

      @Patch('progress/materials/:materialId')
      @RequirePermissions('progress.recalculate')
      updateProgress(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { enrollmentId: string; studiedSeconds: number }
      ) {
        return {
          id: 'progress_1',
          tenantId: context.tenantId,
          updatedBy: context.userId,
          enrollmentId: body.enrollmentId,
          studiedSeconds: body.studiedSeconds,
          status: body.studiedSeconds >= 60 ? 'completed' : 'in_progress'
        };
      }

      // Phase 2 Plan A — bulk-import permission boundary
      @Post('learners/bulk-import')
      @RequirePermissions('learners.write', 'enrollments.write')
      bulkImportLearners(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { idempotencyKey: string; groupId: string; rows: Array<unknown> }
      ) {
        return {
          tenantId: context.tenantId,
          actorId: context.userId,
          idempotencyKey: body.idempotencyKey,
          groupId: body.groupId,
          total: body.rows.length
        };
      }

      // Phase 2 Plan B — updateLearnerExtended permission boundary
      @Patch('learners/:id/profile')
      @RequirePermissions('learners.write')
      updateLearnerExtended(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { firstName?: string; lastName?: string; email?: string }
      ) {
        return {
          id: 'learner-1',
          tenantId: context.tenantId,
          updatedBy: context.userId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email
        };
      }

      // Phase 2 Plan C — counterparty extended PATCH permission boundary
      @Patch('counterparties/:id/profile')
      @RequirePermissions('counterparties.write')
      updateCounterpartyExtended(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { name?: string; inn?: string }
      ) {
        return {
          id: 'cp-1',
          tenantId: context.tenantId,
          updatedBy: context.userId,
          name: body.name,
          inn: body.inn
        };
      }

      // Phase 2 Plan C — setGroupCounterparty permission boundary
      @Patch('groups/:id/counterparty')
      @RequirePermissions('counterparties.write')
      setGroupCounterparty(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { counterpartyId: string | null }
      ) {
        return {
          id: 'group-1',
          tenantId: context.tenantId,
          updatedBy: context.userId,
          counterpartyId: body.counterpartyId
        };
      }

      // Phase 2 Plan C — group progress summary permission boundary
      @Get('groups/:id/progress-summary')
      @RequirePermissions('enrollments.read')
      getGroupProgressSummary(@CurrentContext() context: { tenantId?: string }) {
        return {
          groupId: 'group-1',
          tenantId: context.tenantId,
          totalLearners: 0,
          enrollments: { total: 0, completed: 0, inProgress: 0, notStarted: 0 },
          avgCompletionRate: 0,
          perCourse: []
        };
      }

      // Phase 2 Plan C — counterparty progress summary (requires BOTH perms)
      @Get('counterparties/:id/progress-summary')
      @RequirePermissions('counterparties.read', 'enrollments.read')
      getCounterpartyProgressSummary(@CurrentContext() context: { tenantId?: string }) {
        return {
          counterpartyId: 'cp-1',
          tenantId: context.tenantId,
          totalLearners: 0,
          enrollments: { total: 0, completed: 0, inProgress: 0, notStarted: 0 },
          avgCompletionRate: 0,
          perCourse: []
        };
      }

      // Wave 2 — ОТ registry export (POST requires write; GET requires read)
      @Post('ot-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createOtRegistryExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { groupId?: string; clientId?: string }
      ) {
        return {
          batchId: 'otb_stub',
          tenantId: context.tenantId,
          createdBy: context.userId,
          groupId: body.groupId ?? null,
          total: 0,
          exported: 0,
          failed: 0
        };
      }

      @Get('ot-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listOtRegistryExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      // Wave 2 sub-goal A — ФРДО registry export (POST requires write; GET requires read)
      @Post('frdo-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createFrdoRegistryExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { from?: string; to?: string }
      ) {
        return {
          batchId: 'frb_stub',
          tenantId: context.tenantId,
          createdBy: context.userId,
          from: body.from ?? null,
          total: 0,
          exported: 0,
          failed: 0
        };
      }

      @Get('frdo-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listFrdoRegistryExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestMvpController],
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

  it('returns auth_required for GET /courses without bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/courses`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });

    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('auth_required');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for PATCH /progress/materials/:materialId without progress permission', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_teacher_1',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['teacher']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/progress/materials/material_1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ enrollmentId: 'enr_1', studiedSeconds: 30 })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns session_inactive for GET /courses when session is revoked', async () => {
    authServiceMock.isSessionActive.mockResolvedValueOnce(false);
    const token = issueSignedAccessToken(
      {
        sub: 'u_teacher_1',
        tenant_id: 'tenant_demo',
        session_id: 's_revoked',
        roles: ['teacher']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/courses`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('session_inactive');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success for PATCH /progress/materials/:materialId with required permission', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'courses.read',
      'progress.recalculate'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_teacher_2',
        tenant_id: 'tenant_demo',
        session_id: 's_active_2',
        roles: ['teacher']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/progress/materials/material_1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ enrollmentId: 'enr_1', studiedSeconds: 120 })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { tenantId: string; updatedBy: string; status: string; studiedSeconds: number };
      meta: { requestId: string; correlationId: string };
    };
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.updatedBy).toBe('u_teacher_2');
    expect(payload.data.status).toBe('completed');
    expect(payload.data.studiedSeconds).toBe(120);
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  // === Phase 2 Plan A — POST /learners/bulk-import permission boundary ===

  const bulkImportBody = {
    idempotencyKey: 'idem_x',
    groupId: 'group_x',
    rows: [{ rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' }]
  };

  it('POST /learners/bulk-import: returns auth_required without bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/learners/bulk-import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
      body: JSON.stringify(bulkImportBody)
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('auth_required');
  });

  it('POST /learners/bulk-import: 403 permission_denied without learners.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['enrollments.write']);
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/learners/bulk-import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(bulkImportBody)
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('POST /learners/bulk-import: 403 permission_denied without enrollments.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['learners.write']);
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/learners/bulk-import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(bulkImportBody)
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('POST /learners/bulk-import: 403 session_inactive when session revoked', async () => {
    authServiceMock.isSessionActive.mockResolvedValueOnce(false);
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'learners.write',
      'enrollments.write'
    ]);
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's_revoked', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/learners/bulk-import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(bulkImportBody)
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('session_inactive');
  });

  it('POST /learners/bulk-import: 200 success with both permissions', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'learners.write',
      'enrollments.write'
    ]);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/learners/bulk-import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(bulkImportBody)
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { tenantId: string; actorId: string; idempotencyKey: string; total: number };
      meta: { requestId: string };
    };
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.actorId).toBe('u_admin');
    expect(payload.data.idempotencyKey).toBe('idem_x');
    expect(payload.data.total).toBe(1);
    expect(payload.meta.requestId).toBeTruthy();
  });

  // === Phase 2 Plan B — PATCH /learners/:id/profile permission boundary ===

  describe('PATCH /learners/:id/profile (Plan B)', () => {
    // Reset mock queue before each test to avoid leakage from prior session_inactive
    // tests that set iamServiceMock.resolvePermissions.mockResolvedValueOnce but the
    // guard short-circuits before calling resolvePermissions, leaving a stale once-mock.
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('returns 401 auth_required when no Authorization header', async () => {
      const response = await fetch(`${apiBaseUrl}/learners/learner-1/profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({ firstName: 'X' })
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('auth_required');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('returns 403 permission_denied when actor lacks learners.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['learners.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['learner'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/learners/learner-1/profile`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ firstName: 'X' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('permission_denied');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('returns 200 + envelope on success with learners.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['learners.read', 'learners.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/learners/learner-1/profile`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ firstName: 'Иван', email: 'ivan@example.com' })
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { firstName?: string; email?: string };
        meta: { requestId: string; correlationId: string };
      };
      expect(payload.data.firstName).toBe('Иван');
      expect(payload.data.email).toBe('ivan@example.com');
      expect(payload.meta.requestId).toBeTruthy();
      expect(payload.meta.correlationId).toBeTruthy();
    });
  });
  // NOTE: 400 validation_error case intentionally omitted — the stub controller does not
  // call assertValidDto (matches Plan A bulk-import pattern), so DTO validation is not
  // exercised at the HTTP integration layer. Covered by update-learner-extended.dto-validation.test.ts.

  describe('Phase 2 Plan C — counterparty extended + group/counterparty progress', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('PATCH /counterparties/:id/profile — 401 auth_required without bearer', async () => {
      const response = await fetch(`${apiBaseUrl}/counterparties/cp-1/profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({ name: 'Updated' })
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('auth_required');
    });

    it('PATCH /counterparties/:id/profile — 403 permission_denied without counterparties.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['counterparties.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/counterparties/cp-1/profile`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: 'X' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('PATCH /counterparties/:id/profile — 200 success with counterparties.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['counterparties.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/counterparties/cp-1/profile`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: 'ООО Новое', inn: '7707083893' })
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { name?: string; inn?: string };
        meta: { requestId: string };
      };
      expect(payload.data.name).toBe('ООО Новое');
      expect(payload.data.inn).toBe('7707083893');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('PATCH /groups/:id/counterparty — 403 without counterparties.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce([
        'groups.write',
        'counterparties.read'
      ]);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/groups/group-1/counterparty`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ counterpartyId: 'cp-1' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /groups/:id/progress-summary — 403 without enrollments.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['groups.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/groups/group-1/progress-summary`, {
        headers: {
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /counterparties/:id/progress-summary — 403 when missing one of the required perms', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['counterparties.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/counterparties/cp-1/progress-summary`, {
        headers: {
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /counterparties/:id/progress-summary — 200 with BOTH perms', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce([
        'counterparties.read',
        'enrollments.read'
      ]);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/counterparties/cp-1/progress-summary`, {
        headers: {
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { counterpartyId?: string; totalLearners?: number };
        meta: { requestId: string };
      };
      expect(payload.data.counterpartyId).toBe('cp-1');
      expect(payload.data.totalLearners).toBe(0);
      expect(payload.meta.requestId).toBeTruthy();
    });
  });

  // === Wave 2 — ОТ registry export RBAC boundary ===

  describe('ОТ registry export permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('POST /ot-registry/exports — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/ot-registry/exports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('auth_required');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('POST /ot-registry/exports — 403 permission_denied without regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/ot-registry/exports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ groupId: 'g1' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('permission_denied');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('POST /ot-registry/exports — 201 success with regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/ot-registry/exports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ groupId: 'g1' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { batchId: string; tenantId: string; createdBy: string };
        meta: { requestId: string; correlationId: string };
      };
      expect(payload.data.batchId).toBe('otb_stub');
      expect(payload.data.tenantId).toBe('tenant_demo');
      expect(payload.data.createdBy).toBe('u_admin');
      expect(payload.meta.requestId).toBeTruthy();
      expect(payload.meta.correlationId).toBeTruthy();
    });

    it('GET /ot-registry/exports — 403 permission_denied without regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/ot-registry/exports`, {
        headers: {
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /ot-registry/exports — 200 success with regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/ot-registry/exports`, {
        headers: {
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { items: unknown[]; tenantId: string };
        meta: { requestId: string };
      };
      expect(Array.isArray(payload.data.items)).toBe(true);
      expect(payload.data.tenantId).toBe('tenant_demo');
      expect(payload.meta.requestId).toBeTruthy();
    });
  });

  // === Wave 2 sub-goal A — ФРДО registry export RBAC boundary ===

  describe('ФРДО registry export permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('POST /frdo-registry/exports — 403 permission_denied without regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/frdo-registry/exports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('POST /frdo-registry/exports — 201 success with regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/frdo-registry/exports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ from: '2026-01-01' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { batchId: string; tenantId: string; createdBy: string };
        meta: { requestId: string };
      };
      expect(payload.data.batchId).toBe('frb_stub');
      expect(payload.data.tenantId).toBe('tenant_demo');
      expect(payload.data.createdBy).toBe('u_admin');
      expect(payload.meta.requestId).toBeTruthy();
    });

    it('GET /frdo-registry/exports — 403 permission_denied without regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/frdo-registry/exports`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /frdo-registry/exports — 200 success with regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/frdo-registry/exports`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { items: unknown[]; tenantId: string };
        meta: { requestId: string };
      };
      expect(Array.isArray(payload.data.items)).toBe(true);
      expect(payload.data.tenantId).toBe('tenant_demo');
    });
  });
});
