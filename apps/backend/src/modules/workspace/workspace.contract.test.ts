import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

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

const responseMetaSchema = z.object({
  requestId: z.string().min(1),
  correlationId: z.string().min(1),
  timestamp: z.string().min(1)
});

const workspaceSummarySchema = z.object({
  overdueCount: z.number().int().nonnegative(),
  blockersCount: z.number().int().nonnegative(),
  nextActions: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      route: z.string().min(1)
    })
  ),
  deepLinks: z.array(
    z.object({
      key: z.string().min(1),
      route: z.string().min(1)
    })
  )
});

const workspaceTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'overdue']),
  dueAt: z.string().optional(),
  route: z.string().min(1)
});

const workspaceBlockerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  route: z.string().min(1)
});

describe('Workspace API contract', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      throttlerImport,
      filterImport,
      contextInterceptorImport,
      envelopeImport,
      workspaceServiceImport,
      currentContextDecoratorImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('./workspace.service.js'),
      import('../../common/decorators/current-context.decorator.js')
    ]);

    const { NestFactory } = nestjsCore;
    const { Controller, Get, Module, ValidationPipe } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;
    const { WorkspaceService } = workspaceServiceImport;
    const { CurrentContext } = currentContextDecoratorImport;

    const { workspaceTestDatabaseStub } = await import('./workspace.test-db.stub.js');
    const workspaceService = new WorkspaceService(workspaceTestDatabaseStub);

    @Controller()
    class TestWorkspaceController {
      @Get('workspace/summary')
      getSummary(@CurrentContext() context: { tenantId?: string }) {
        return workspaceService.getWorkspaceSummary(context.tenantId!);
      }

      @Get('tasks/inbox')
      async getTasksInbox(@CurrentContext() context: { tenantId?: string }) {
        return { items: await workspaceService.getTasksInbox(context.tenantId!) };
      }

      @Get('blockers')
      async getBlockers(@CurrentContext() context: { tenantId?: string }) {
        return { items: await workspaceService.getBlockers(context.tenantId!) };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestWorkspaceController],
      providers: []
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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('matches contract for GET /workspace/summary', async () => {
    const response = await fetch(`${apiBaseUrl}/workspace/summary`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(200);

    const json = await response.json();
    const envelopeSchema = z.object({ data: workspaceSummarySchema, meta: responseMetaSchema });
    const parsed = envelopeSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it('matches contract for GET /tasks/inbox', async () => {
    const response = await fetch(`${apiBaseUrl}/tasks/inbox`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(200);

    const json = await response.json();
    const envelopeSchema = z.object({
      data: z.object({ items: z.array(workspaceTaskSchema) }),
      meta: responseMetaSchema
    });
    const parsed = envelopeSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it('matches contract for GET /blockers', async () => {
    const response = await fetch(`${apiBaseUrl}/blockers`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(200);

    const json = await response.json();
    const envelopeSchema = z.object({
      data: z.object({ items: z.array(workspaceBlockerSchema) }),
      meta: responseMetaSchema
    });
    const parsed = envelopeSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });
});
