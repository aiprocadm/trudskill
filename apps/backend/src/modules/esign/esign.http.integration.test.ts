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
      ForbiddenException,
      Get,
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
        } else if (method === 'POST') {
          const isParticipantSign = /\/esign\/participants\/[^/]+\/sign$/.test(trimmed);
          const isSubmit = /\/esign\/applications\/[^/]+\/submit$/.test(trimmed);
          const isStartReview = /\/esign\/applications\/[^/]+\/start-review$/.test(trimmed);
          const isReviewApplicationFileMutation =
            /\/esign\/application-files\/[^/]+\/(verify|reject)$/.test(trimmed);
          if (isParticipantSign) {
            required = ['esign.participants.sign'];
          } else if (isSubmit) {
            required = ['esign.applications.submit'];
          } else if (isStartReview) {
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

      @Get('application-files')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.applications.read')
      listApplicationFiles(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'eaf_stub_1', tenantId: context.tenantId }] };
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

      @Get('legal-log')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.legal.read')
      listLegalLog(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'll_stub_1', tenantId: context.tenantId }] };
      }

      @Get('processes')
      @UseGuards(TestPermissionGuard)
      @RequirePermissions('esign.processes.read')
      listProcesses(@CurrentContext() context: { tenantId?: string }) {
        return { items: [{ id: 'proc_stub_1', tenantId: context.tenantId }] };
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
});
