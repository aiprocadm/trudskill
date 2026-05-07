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

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

describe('E-sign HTTP integration (permission boundaries)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';
  let issueSignedAccessToken: (
    payload: { sub: string; tenant_id: string; session_id: string; roles: string[] },
    secret: string,
    ttlSeconds: number
  ) => string;

  const authServiceMock = {
    isSessionActive: vi.fn().mockResolvedValue(true)
  };
  const iamServiceMock = {
    resolvePermissions: vi.fn().mockResolvedValue(['esign.applications.read'])
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

    const { NestFactory } = nestjsCore;
    const {
      Body,
      Controller,
      Delete,
      ForbiddenException,
      Get,
      Injectable,
      Module,
      Param,
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
        const request = context.switchToHttp().getRequest() as {
          method?: string;
          url?: string;
          originalUrl?: string;
          context?: { tenantId?: string; userId?: string; sessionId?: string };
        };
        const routePath = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
        const trimmed = routePath.replace(/\/$/, '');
        const method = request.method ?? '';

        let required: string[] = [];
        if (method === 'GET') {
          if (/\/esign\/legal-log(\/[^/]+)?$/.test(trimmed)) {
            required = ['esign.legal.read'];
          } else if (
            /\/esign\/processes(\/|$)/.test(trimmed) ||
            trimmed.endsWith('/esign/participants') ||
            /\/esign\/events(\/|$)/.test(trimmed)
          ) {
            required = ['esign.processes.read'];
          } else {
            required = ['esign.applications.read'];
          }
        } else if (method === 'DELETE') {
          if (/\/esign\/application-files\/[^/]+$/.test(trimmed)) {
            required = ['esign.applications.write'];
          }
        } else if (method === 'PATCH') {
          if (/\/esign\/applications\/[^/]+$/.test(trimmed)) {
            required = ['esign.applications.write'];
          } else if (/\/esign\/participants\/[^/]+$/.test(trimmed)) {
            required = ['esign.processes.write'];
          }
        } else if (method === 'POST') {
          const isReuseCheck = /\/esign\/applications\/[^/]+\/reuse-check$/.test(trimmed);
          const isProcessWrite =
            /\/esign\/processes$/.test(trimmed) ||
            /\/esign\/processes\/[^/]+\/(start|cancel)$/.test(trimmed);
          const isParticipantSkip = /\/esign\/participants\/[^/]+\/skip$/.test(trimmed);
          const isParticipantInvite = /\/esign\/participants\/[^/]+\/invite$/.test(trimmed);
          const isParticipantsCreate = /\/esign\/participants$/.test(trimmed);
          const isParticipantSignerAction =
            /\/esign\/participants\/[^/]+\/(sign|mark-viewed|reject)$/.test(trimmed);
          const isParticipantSign = isParticipantSignerAction;
          const isSubmit = /\/esign\/applications\/[^/]+\/submit$/.test(trimmed);
          const isApplicationReviewAction =
            /\/esign\/applications\/[^/]+\/(start-review|approve|reject)$/.test(trimmed);
          const isReviewApplicationFileMutation =
            /\/esign\/application-files\/[^/]+\/(verify|reject)$/.test(trimmed);
          if (isProcessWrite) {
            required = ['esign.processes.write'];
          } else if (isParticipantSkip) {
            required = ['esign.processes.write'];
          } else if (isParticipantsCreate) {
            required = ['esign.processes.write'];
          } else if (isParticipantInvite) {
            required = ['esign.processes.write'];
          } else if (isReuseCheck) {
            required = ['esign.applications.read'];
          } else if (isParticipantSign) {
            required = ['esign.participants.sign'];
          } else if (isSubmit) {
            required = ['esign.applications.submit'];
          } else if (isApplicationReviewAction) {
            required = ['esign.applications.review'];
          } else if (isReviewApplicationFileMutation) {
            required = ['esign.applications.review'];
          } else if (trimmed.endsWith('/esign/application-files')) {
            required = ['esign.applications.write'];
          } else if (trimmed.endsWith('/esign/applications')) {
            required = ['esign.applications.write'];
          }
        }

        if (required.length === 0) return true;

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

    @Controller('esign')
    @UseGuards(TenantGuard)
    class TestEsignApplicationsController {
      @Get('applications')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      list(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'app_1', tenantId: context.tenantId }] };
      }

      @Get('applications/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      getApplication(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, title: 'stub_app' };
      }

      @Get('application-files')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      listApplicationFiles(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'eaf_stub_1', tenantId: context.tenantId }] };
      }

      @Get('application-files/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      getApplicationFile(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string
      ) {
        return { id, tenantId: context.tenantId, name: 'stub_file' };
      }

      @Post('application-files')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.write')
      createApplicationFile(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { name?: string }
      ) {
        return {
          id: 'eaf_created',
          tenantId: context.tenantId,
          createdBy: context.userId,
          name: body.name ?? 'file'
        };
      }

      @Post('application-files/:id/verify')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.review')
      verifyApplicationFile(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string
      ) {
        return { id, tenantId: context.tenantId, verified: true };
      }

      @Post('application-files/:id/reject')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.review')
      rejectApplicationFile(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: { reason?: string }
      ) {
        return { id, tenantId: context.tenantId, status: 'rejected_stub' };
      }

      @Post('applications')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.write')
      create(@CurrentContext() context: { tenantId?: string; userId?: string }) {
        return { id: 'app_new', tenantId: context.tenantId, createdBy: context.userId };
      }

      @Post('applications/:id/start-review')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.review')
      startReview(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'in_review_stub' };
      }

      @Post('applications/:id/approve')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.review')
      approve(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'approved_stub' };
      }

      @Post('applications/:id/reject')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.review')
      rejectApplication(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: { reason?: string }
      ) {
        return { id, tenantId: context.tenantId, status: 'rejected_app_stub' };
      }

      @Patch('applications/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.write')
      patchApplication(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() body: { title?: string }
      ) {
        return { id, tenantId: context.tenantId, title: body.title ?? 'patched_app' };
      }

      @Post('applications/:id/reuse-check')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      reuseCheckStub(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, reusable: true };
      }

      @Delete('application-files/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.write')
      deleteApplicationFile(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string
      ) {
        return { id, tenantId: context.tenantId, deleted: true };
      }

      @Post('applications/:id/submit')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.submit')
      submit(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'submitted_stub' };
      }

      @Post('participants/:id/sign')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.participants.sign')
      signParticipant(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: Record<string, unknown>
      ) {
        return { id, tenantId: context.tenantId, status: 'signed_stub' };
      }

      @Post('participants/:id/reject')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.participants.sign')
      rejectParticipantStub(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: Record<string, unknown>
      ) {
        return { id, tenantId: context.tenantId, status: 'participant_rejected_stub' };
      }

      @Get('legal-log')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.legal.read')
      listLegalLog(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'll_stub_1', tenantId: context.tenantId }] };
      }

      @Get('legal-log/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.legal.read')
      getLegalLog(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, event: 'stub_legal' };
      }

      @Get('processes')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      listProcesses(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'proc_stub_1', tenantId: context.tenantId }] };
      }

      @Get('processes/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      getProcess(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, title: 'stub_process' };
      }

      @Get('processes/:id/status')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      getProcessStatus(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'stub_status' };
      }

      @Get('participants')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      listParticipants(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'part_stub_1', tenantId: context.tenantId }] };
      }

      @Get('events')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      listEvents(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'ev_stub_1', tenantId: context.tenantId }] };
      }

      @Get('events/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      getEvent(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, type: 'stub_event' };
      }

      @Post('processes')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      createProcess(@CurrentContext() context: { tenantId?: string; userId?: string }) {
        return { id: 'proc_created', tenantId: context.tenantId, createdBy: context.userId };
      }

      @Post('processes/:id/start')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      startProcessStub(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'started_stub' };
      }

      @Post('processes/:id/cancel')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      cancelProcessStub(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'cancelled_stub' };
      }

      @Post('participants')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      createParticipantStub(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() _body: { processId?: string }
      ) {
        return {
          id: 'part_created',
          tenantId: context.tenantId,
          createdBy: context.userId
        };
      }

      @Post('participants/:id/invite')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      inviteStub(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'invited_stub' };
      }

      @Post('participants/:id/skip')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      skipParticipantStub(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: Record<string, unknown>
      ) {
        return { id, tenantId: context.tenantId, status: 'skipped_stub' };
      }

      @Post('participants/:id/mark-viewed')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.participants.sign')
      markViewedStub(@CurrentContext() context: { tenantId?: string }, @Param('id') id: string) {
        return { id, tenantId: context.tenantId, status: 'viewed_stub' };
      }

      @Patch('participants/:id')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.write')
      patchParticipantStub(
        @CurrentContext() context: { tenantId?: string },
        @Param('id') id: string,
        @Body() _body: { role?: string }
      ) {
        return { id, tenantId: context.tenantId, status: 'participant_patched_stub' };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestEsignApplicationsController],
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

  it('returns permission_denied for POST …/applications/:id/submit without esign.applications.submit', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_drafter',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_x/submit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/applications/:id/submit with esign.applications.submit', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.submit'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_submitter',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_y/submit`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('app_y');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('submitted_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/applications/:id/start-review without esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.submit'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_submitter_only',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_z/start-review`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/applications/:id/start-review with esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.review'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_reviewer',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_r/start-review`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('app_r');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('in_review_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/applications/:id/approve without esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.submit'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_no_review_approve',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_ap/approve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for POST …/applications/:id/reject without esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.submit'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_no_review_reject_app',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_rj/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: 'не проходит проверку' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/applications/:id/approve with esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.review'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_reviewer_approve',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_ok/approve`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('app_ok');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('approved_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for PATCH …/applications/:id without esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.submit'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_submitter_patch',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_patch_a`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'x' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for PATCH …/applications/:id with esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_writer_patch',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_patch_b`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'Новый заголовок' })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; title: string };
      meta: { requestId: string };
    };
    expect(payload.data.id).toBe('app_patch_b');
    expect(payload.data.title).toBe('Новый заголовок');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for POST …/applications/:id/reuse-check without esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_reuse',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_reuse_1/reuse-check`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/applications/:id/reuse-check with esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_reuse_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_reuse_2/reuse-check`, {
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
      data: { id: string; tenantId?: string; reusable?: boolean };
      meta: { requestId: string };
    };
    expect(payload.data.id).toBe('app_reuse_2');
    expect(payload.data.reusable).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for DELETE …/application-files/:id without esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_reader_delete_file',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_del1`, {
      method: 'DELETE',
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
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for DELETE …/application-files/:id with esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_editor_delete_file',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_del2`, {
      method: 'DELETE',
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; deleted: boolean };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('eaf_del2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.deleted).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/participants/:id/sign without esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_process_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/p1/sign`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ comment: 'ok' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/participants/:id/sign with esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.participants.sign'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_signer',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/p2/sign`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ comment: 'signed' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('p2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('signed_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for GET …/legal-log without esign.legal.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_app_only',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/legal-log`, {
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
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for GET …/legal-log with esign.legal.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.legal.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_auditor',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/legal-log`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { items: Array<{ id: string; tenantId?: string }> };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.items[0]?.id).toBe('ll_stub_1');
    expect(payload.data.items[0]?.tenantId).toBe('tenant_demo');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for GET …/processes without esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_apps_operator',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes`, {
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
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for GET …/processes with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_process_observer',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { items: Array<{ id: string; tenantId?: string }> };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.items[0]?.id).toBe('proc_stub_1');
    expect(payload.data.items[0]?.tenantId).toBe('tenant_demo');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/processes without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_readonly',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'stub' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/processes with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_editor',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'stub' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; createdBy?: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('proc_created');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.createdBy).toBe('u_esign_proc_editor');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/processes/:id/start without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_readonly_start',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/ps1/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/processes/:id/start with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_start',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/ps2/start`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('ps2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('started_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/participants/:id/skip without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.participants.sign'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_signer_no_skip',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pskip1/skip`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/participants/:id/skip with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_skip',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pskip2/skip`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('pskip2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('skipped_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/participants/:id/mark-viewed without esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_admin_no_sign',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pview1/mark-viewed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/participants/:id/mark-viewed with esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.participants.sign'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_marker',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pview2/mark-viewed`, {
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
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('pview2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('viewed_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for PATCH …/participants/:id without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.participants.sign'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_signer_patch_part',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/ppatch1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ role: 'x' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for PATCH …/participants/:id with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_patch_part',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/ppatch2`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ role: 'updated' })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string };
    };
    expect(payload.data.id).toBe('ppatch2');
    expect(payload.data.status).toBe('participant_patched_stub');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns permission_denied for GET …/application-files without esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_proc_only_files',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files`, {
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
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for GET …/application-files with esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_app_files_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { items: Array<{ id: string; tenantId?: string }> };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.items[0]?.id).toBe('eaf_stub_1');
    expect(payload.data.items[0]?.tenantId).toBe('tenant_demo');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/application-files without esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_reader_files',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Приложение' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/application-files with esign.applications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_editor_files',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Приложение' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; createdBy?: string; name: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('eaf_created');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.createdBy).toBe('u_esign_editor_files');
    expect(payload.data.name).toBe('Приложение');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/application-files/:id/verify without esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_file_editor',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_v1/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/application-files/:id/verify with esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.review'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_file_reviewer',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_v2/verify`, {
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
      data: { id: string; tenantId?: string; verified: boolean };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('eaf_v2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.verified).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/application-files/:id/reject without esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_file_editor_reject',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_r1/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: 'некачественное сканирование' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('returns success envelope for POST …/application-files/:id/reject with esign.applications.review', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.applications.read',
      'esign.applications.write',
      'esign.applications.review'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_file_reviewer_reject',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_r2/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: 'не соответствует шаблону' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; status: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.id).toBe('eaf_r2');
    expect(payload.data.tenantId).toBe('tenant_demo');
    expect(payload.data.status).toBe('rejected_stub');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
  });

  it('returns permission_denied for POST …/participants without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_no_create_participant',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ processId: 'proc_x' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for POST …/participants with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_create_participant',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ processId: 'proc_x' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; tenantId?: string; createdBy?: string };
    };
    expect(payload.data.id).toBe('part_created');
    expect(payload.data.createdBy).toBe('u_esign_create_participant');
  });

  it('returns permission_denied for POST …/participants/:id/invite without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.participants.sign']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_signer_no_invite',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/p_inv/invite`, {
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

  it('returns success envelope for POST …/participants/:id/invite with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_inviter',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/p_inv2/invite`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { id: string; status: string } };
    expect(payload.data.id).toBe('p_inv2');
    expect(payload.data.status).toBe('invited_stub');
  });

  it('returns permission_denied for POST …/processes/:id/cancel without esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_no_cancel',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/pc1/cancel`, {
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

  it('returns success envelope for POST …/processes/:id/cancel with esign.processes.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.processes.write'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_canceler',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/pc2/cancel`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { id: string; status: string } };
    expect(payload.data.id).toBe('pc2');
    expect(payload.data.status).toBe('cancelled_stub');
  });

  it('returns permission_denied for POST …/participants/:id/reject without esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.write']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_admin_no_part_reject',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pr1/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ comment: 'no' })
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for POST …/participants/:id/reject with esign.participants.sign', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'esign.processes.read',
      'esign.participants.sign'
    ]);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_part_rejecter',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants/pr2/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ comment: 'отклонено' })
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { id: string; status: string } };
    expect(payload.data.id).toBe('pr2');
    expect(payload.data.status).toBe('participant_rejected_stub');
  });

  it('returns permission_denied for GET …/events without esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_apps_no_events',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/events`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for GET …/events with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_events_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/events`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(payload.data.items[0]?.id).toBe('ev_stub_1');
  });

  it('returns success envelope for GET …/applications/:id with esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_app_by_id',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/applications/app_by_id_test`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; title: string } };
    expect(payload.data.id).toBe('app_by_id_test');
    expect(payload.data.title).toBe('stub_app');
  });

  it('returns permission_denied for GET …/legal-log/:id without esign.legal.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_no_legal_entry',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/legal-log/ll_e1`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for GET …/legal-log/:id with esign.legal.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.legal.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_legal_entry',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/legal-log/ll_e2`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; event: string } };
    expect(payload.data.id).toBe('ll_e2');
    expect(payload.data.event).toBe('stub_legal');
  });

  it('returns permission_denied for GET …/processes/:id without esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_apps_no_process_by_id',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/proc_1`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for GET …/processes/:id with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_process_by_id_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/proc_2`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; title: string } };
    expect(payload.data.id).toBe('proc_2');
    expect(payload.data.title).toBe('stub_process');
  });

  it('returns success envelope for GET …/processes/:id/status with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_process_status_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/processes/proc_3/status`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; status: string } };
    expect(payload.data.id).toBe('proc_3');
    expect(payload.data.status).toBe('stub_status');
  });

  it('returns permission_denied for GET …/participants without esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_apps_no_participants',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for GET …/participants with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_participants_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/participants`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { items: Array<{ id: string }> } };
    expect(payload.data.items[0]?.id).toBe('part_stub_1');
  });

  it('returns success envelope for GET …/events/:id with esign.processes.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_event_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/events/event_1`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; type: string } };
    expect(payload.data.id).toBe('event_1');
    expect(payload.data.type).toBe('stub_event');
  });

  it('returns permission_denied for GET …/application-files/:id without esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.processes.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_process_no_app_file_by_id',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_1`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success envelope for GET …/application-files/:id with esign.applications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['esign.applications.read']);
    const token = issueSignedAccessToken(
      {
        sub: 'u_esign_app_file_by_id_reader',
        tenant_id: 'tenant_demo',
        session_id: 's_active',
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET!,
      60
    );

    const response = await fetch(`${apiBaseUrl}/esign/application-files/eaf_2`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { id: string; name: string } };
    expect(payload.data.id).toBe('eaf_2');
    expect(payload.data.name).toBe('stub_file');
  });
});
