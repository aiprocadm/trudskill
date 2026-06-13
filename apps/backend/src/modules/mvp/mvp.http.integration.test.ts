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
  DB_MIGRATIONS_ENABLED: 'false',
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

      // Phase 5 Plan 5A — notifications permission boundary
      @Get('email-deliveries')
      @RequirePermissions('notifications.read')
      listEmailDeliveries(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], total: 0, tenantId: context.tenantId };
      }

      @Get('email-templates')
      @RequirePermissions('notifications.read')
      listEmailTemplates(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Put('email-templates/:key')
      @RequirePermissions('notifications.write')
      upsertEmailTemplate(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { subject: string; body: string }
      ) {
        return {
          templateKey: 'enrollment_invite',
          updatedBy: context.userId,
          subject: body.subject
        };
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

      // Wave 2 sub-goal C — ЕИСОТ testing roster (POST requires write; GET requires read)
      @Post('eisot-testing-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createEisotTestingExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { from?: string; to?: string }
      ) {
        return {
          batchId: 'etb_stub',
          tenantId: context.tenantId,
          from: body.from ?? null,
          to: body.to ?? null
        };
      }

      @Get('eisot-testing-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listEisotTestingExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      // Phase 5 Plan 5B — recertification permission boundary
      @Get('recertification-drafts')
      @RequirePermissions('recertification.read')
      listRecertDrafts(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('recertification-drafts/:id/approve')
      @RequirePermissions('recertification.write')
      approveRecertDraft(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { targetGroupId: string }
      ) {
        return { id: 'recert_1', status: 'approved', targetGroupId: body.targetGroupId };
      }

      // Phase 4 Plan A — identity verification permission boundary
      @Get('identity-verifications')
      @RequirePermissions('identity.read')
      listIdentityVerifications(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('identity-verifications')
      @RequirePermissions('identity.submit')
      startIdentityVerification(@CurrentContext() context: { tenantId?: string }) {
        return { id: 'idv_1', verificationStatus: 'draft', tenantId: context.tenantId };
      }

      @Post('identity-verifications/:id/review')
      @RequirePermissions('identity.review')
      reviewIdentityVerification(
        @CurrentContext() context: { tenantId?: string },
        @Body() body: { decision: string }
      ) {
        return {
          id: 'idv_1',
          verificationStatus: body.decision === 'approve' ? 'approved' : 'rejected'
        };
      }

      // Phase 4 Plan B — proctoring permission boundary
      @Get('proctoring-recordings')
      @RequirePermissions('proctoring.read')
      listProctoringRecordings(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('proctoring-recordings')
      @RequirePermissions('proctoring.submit')
      startProctoringRecording(@CurrentContext() context: { tenantId?: string }) {
        return { id: 'prec_1', recordingStatus: 'recording', tenantId: context.tenantId };
      }

      @Patch('enrollments/:id/proctoring-override')
      @RequirePermissions('learners.write')
      setProctoringOverride(
        @CurrentContext() context: { tenantId?: string },
        @Body() body: { override: string | null }
      ) {
        return { id: 'enr_1', proctoringOverride: body.override, tenantId: context.tenantId };
      }

      // Phase 9 Plan A — SCORM permission boundary stubs
      @Get('scorm-packages')
      @RequirePermissions('materials.read')
      listScormPackages(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], total: 0, tenantId: context.tenantId };
      }

      @Post('scorm-packages')
      @RequirePermissions('materials.write')
      registerScormPackage(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { zipFileId?: string }
      ) {
        return { id: 'scp_stub', tenantId: context.tenantId, zipFileId: body.zipFileId };
      }

      @Post('scorm-packages/:id/process')
      @RequirePermissions('materials.write')
      processScormPackage(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string
      ) {
        return { id, tenantId: context.tenantId, packageStatus: 'ready' };
      }

      @Delete('scorm-packages/:id')
      @RequirePermissions('materials.write')
      deleteScormPackage(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string
      ) {
        return { id, deleted: true, tenantId: context.tenantId };
      }

      @Post('scorm-materials/:id/launch')
      @RequirePermissions('materials.read')
      launchScormMaterial(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() body: { enrollmentId?: string }
      ) {
        return {
          attempt: { id: 'sca_stub', materialId: id },
          token: 'stub_token',
          launchUrl: `/api/v1/scorm-content/stub_token/index.html`,
          tenantId: context.tenantId,
          enrollmentId: body.enrollmentId
        };
      }

      @Put('scorm-attempts/:id/commit')
      @RequirePermissions('progress.recalculate')
      commitScormAttempt(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() body: { lessonStatus?: string }
      ) {
        return { id, tenantId: context.tenantId, lessonStatus: body.lessonStatus ?? 'incomplete' };
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

  // === Phase 5 Plan 5A — notifications permission boundary ===

  describe('notifications permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('returns permission_denied for GET /email-deliveries without notifications.read', async () => {
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-deliveries`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('returns success for GET /email-deliveries with notifications.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-deliveries`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('returns permission_denied for GET /email-templates without notifications.read', async () => {
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-templates`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as {
        error: { code: string };
        meta: { requestId: string };
      };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('returns success for GET /email-templates with notifications.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-templates`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('returns permission_denied for PUT /email-templates/:key without notifications.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-templates/enrollment_invite`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subject: 'S', body: 'B' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('returns success for PUT /email-templates/:key with notifications.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.write']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/email-templates/enrollment_invite`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subject: 'Custom', body: 'Body' })
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { subject: string };
        meta: { requestId: string };
      };
      expect(payload.data.subject).toBe('Custom');
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

  // === Wave 2 sub-goal C — ЕИСОТ testing-roster export RBAC boundary ===

  describe('ЕИСОТ testing-roster export permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('POST /eisot-testing-registry/exports — 403 without regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
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

    it('POST /eisot-testing-registry/exports — 201 with regulatory.export.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ from: '2026-01-01' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as { data: { batchId: string } };
      expect(payload.data.batchId).toBe('etb_stub');
    });

    it('GET /eisot-testing-registry/exports — 403 without regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /eisot-testing-registry/exports — 200 with regulatory.export.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { data: { items: unknown[]; tenantId: string } };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });
  });

  // === Phase 5 Plan 5B — recertification admin RBAC boundary ===

  describe('recertification permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('GET /recertification-drafts — 403 permission_denied without recertification.read', async () => {
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/recertification-drafts`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /recertification-drafts — 200 success with recertification.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['recertification.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/recertification-drafts`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('POST /recertification-drafts/:id/approve — 403 permission_denied without recertification.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['recertification.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/recertification-drafts/x/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetGroupId: 'g1' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('POST /recertification-drafts/:id/approve — 201 success with recertification.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['recertification.write']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/recertification-drafts/x/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetGroupId: 'g1' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { targetGroupId: string };
        meta: { requestId: string };
      };
      expect(payload.data.targetGroupId).toBe('g1');
    });
  });

  // === Phase 4 Plan A — identity verification RBAC boundary ===

  describe('identity verification permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('GET /identity-verifications — 403 permission_denied without identity.read', async () => {
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /identity-verifications — 200 success with identity.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['identity.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('POST /identity-verifications — 403 permission_denied without identity.submit', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['identity.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications`, {
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

    it('POST /identity-verifications — 201 success with identity.submit', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['identity.submit']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('POST /identity-verifications/x/review — 403 permission_denied with only identity.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['identity.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications/x/review`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ decision: 'approve' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('POST /identity-verifications/x/review — 201 success with identity.review', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['identity.review']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/identity-verifications/x/review`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ decision: 'approve' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { verificationStatus: string };
        meta: { requestId: string };
      };
      expect(payload.data.verificationStatus).toBe('approved');
    });
  });

  // === Phase 4 Plan B — proctoring RBAC boundary ===

  describe('proctoring permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    it('GET /proctoring-recordings — 403 permission_denied without proctoring.read', async () => {
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /proctoring-recordings — 200 success with proctoring.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { tenantId: string };
        meta: { requestId: string };
      };
      expect(payload.data.tenantId).toBe('tenant_demo');
    });

    it('POST /proctoring-recordings — 403 permission_denied with only proctoring.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
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

    it('POST /proctoring-recordings — 201 success with proctoring.submit', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.submit']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { recordingStatus: string };
        meta: { requestId: string };
      };
      expect(payload.data.recordingStatus).toBe('recording');
    });

    it('PATCH /enrollments/x/proctoring-override — 403 permission_denied without learners.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/enrollments/x/proctoring-override`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ override: 'exempt' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('PATCH /enrollments/x/proctoring-override — 200 success with learners.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['learners.write']);
      const token = issueSignedAccessToken(
        {
          sub: 'u_admin',
          tenant_id: 'tenant_demo',
          session_id: 's_active',
          roles: ['tenant_admin']
        },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/enrollments/x/proctoring-override`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ override: 'exempt' })
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { proctoringOverride: string };
        meta: { requestId: string };
      };
      expect(payload.data.proctoringOverride).toBe('exempt');
    });
  });

  // === Phase 9 Plan A — SCORM permission boundary ===

  describe('Phase 9 Plan A — SCORM permission boundary', () => {
    beforeEach(() => {
      iamServiceMock.resolvePermissions.mockReset();
      iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
    });

    // GET /scorm-packages — requires materials.read

    it('GET /scorm-packages — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
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

    it('GET /scorm-packages — 403 permission_denied without materials.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('GET /scorm-packages — 200 success with materials.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { items: unknown[] };
        meta: { requestId: string };
      };
      expect(Array.isArray(payload.data.items)).toBe(true);
      expect(payload.meta.requestId).toBeTruthy();
    });

    // POST /scorm-packages — requires materials.write

    it('POST /scorm-packages — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({ zipFileId: 'file_1' })
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('auth_required');
    });

    it('POST /scorm-packages — 403 permission_denied without materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ zipFileId: 'file_1' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('POST /scorm-packages — 201 success with materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ zipFileId: 'file_1' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { id: string };
        meta: { requestId: string };
      };
      expect(payload.data.id).toBeTruthy();
      expect(payload.meta.requestId).toBeTruthy();
    });

    // POST /scorm-packages/:id/process — requires materials.write

    it('POST /scorm-packages/:id/process — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('auth_required');
    });

    it('POST /scorm-packages/:id/process — 403 permission_denied without materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1/process`, {
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

    it('POST /scorm-packages/:id/process — 201 success with materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1/process`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { packageStatus: string };
        meta: { requestId: string };
      };
      expect(payload.data.packageStatus).toBe('ready');
      expect(payload.meta.requestId).toBeTruthy();
    });

    // DELETE /scorm-packages/:id — requires materials.write

    it('DELETE /scorm-packages/:id — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': 'tenant_demo' }
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('auth_required');
    });

    it('DELETE /scorm-packages/:id — 403 permission_denied without materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('DELETE /scorm-packages/:id — 200 success with materials.write', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.write']);
      const token = issueSignedAccessToken(
        { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-packages/scp_1`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { deleted: boolean };
        meta: { requestId: string };
      };
      expect(payload.data.deleted).toBe(true);
      expect(payload.meta.requestId).toBeTruthy();
    });

    // POST /scorm-materials/:id/launch — requires materials.read

    it('POST /scorm-materials/:id/launch — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-materials/mat_1/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({ enrollmentId: 'enr_1' })
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('auth_required');
    });

    it('POST /scorm-materials/:id/launch — 403 permission_denied without materials.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['progress.recalculate']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['learner'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-materials/mat_1/launch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enrollmentId: 'enr_1' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('POST /scorm-materials/:id/launch — 201 success with materials.read', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u_learner', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['learner'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-materials/mat_1/launch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enrollmentId: 'enr_1' })
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        data: { token: string; launchUrl: string };
        meta: { requestId: string };
      };
      expect(payload.data.token).toBeTruthy();
      expect(payload.data.launchUrl).toBeTruthy();
      expect(payload.meta.requestId).toBeTruthy();
    });

    // PUT /scorm-attempts/:id/commit — requires progress.recalculate

    it('PUT /scorm-attempts/:id/commit — 401 auth_required without bearer token', async () => {
      const response = await fetch(`${apiBaseUrl}/scorm-attempts/sca_1/commit`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
        body: JSON.stringify({ lessonStatus: 'incomplete' })
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('auth_required');
    });

    it('PUT /scorm-attempts/:id/commit — 403 permission_denied without progress.recalculate', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['materials.read']);
      const token = issueSignedAccessToken(
        { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['learner'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-attempts/sca_1/commit`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lessonStatus: 'incomplete' })
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('permission_denied');
    });

    it('PUT /scorm-attempts/:id/commit — 200 success with progress.recalculate', async () => {
      iamServiceMock.resolvePermissions.mockResolvedValueOnce(['progress.recalculate']);
      const token = issueSignedAccessToken(
        { sub: 'u_learner', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['learner'] },
        process.env.AUTH_JWT_SECRET!,
        60
      );
      const response = await fetch(`${apiBaseUrl}/scorm-attempts/sca_1/commit`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'tenant_demo',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lessonStatus: 'passed' })
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { lessonStatus: string };
        meta: { requestId: string };
      };
      expect(payload.data.lessonStatus).toBe('passed');
      expect(payload.meta.requestId).toBeTruthy();
    });
  });
});
