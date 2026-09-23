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
  DB_MIGRATIONS_ENABLED: 'false',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

/**
 * Граница HTTP модуля задач (ТЗ перехода с CDOPROF §16): настоящий контроллер и настоящий
 * `PermissionGuard`, сервис на хранилище в памяти. Проверяются: 401 без токена, 403 без права,
 * конверт ответа, `filter=all` без `manage_all`, и что `GET /tasks/inbox` из WorkspaceController
 * не перекрыт `GET /tasks/:id`.
 */
describe('Tasks HTTP integration', () => {
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
    resolvePermissions: vi.fn().mockResolvedValue(['tasks.read', 'tasks.write']),
    resolveActorScope: async (t: string, u: string) => ({
      permissions: await iamServiceMock.resolvePermissions(t, u)
    })
  };
  const workspaceServiceStub = {
    getTasksInbox: vi.fn().mockResolvedValue([{ id: 'doc_task_1', kind: 'document' }])
  };

  beforeAll(async () => {
    const [
      { NestFactory },
      { Module, ValidationPipe },
      { ThrottlerModule },
      { HttpExceptionEnvelopeFilter },
      { RequestContextInterceptor },
      { ResponseEnvelopeInterceptor },
      { TenantGuard },
      { PermissionGuard },
      cryptoUtil,
      { TasksController },
      { TasksService },
      { InMemoryTasksRepository },
      { AuditService },
      { WorkspaceController },
      { WorkspaceService },
      { IamService },
      { AuthService }
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('../../common/guards/tenant.guard.js'),
      import('../iam/permission.guard.js'),
      import('../iam/crypto.util.js'),
      import('./tasks.controller.js'),
      import('./tasks.service.js'),
      import('./in-memory-tasks.repository.js'),
      import('../audit/audit.service.js'),
      import('../workspace/workspace.controller.js'),
      import('../workspace/workspace.service.js'),
      import('../iam/services/iam.service.js'),
      import('../iam/services/auth.service.js')
    ]);
    issueSignedAccessToken = cryptoUtil.issueSignedAccessToken;

    const repo = new InMemoryTasksRepository({ tenant_demo: ['u_admin', 'u_worker'] });
    const service = new TasksService(repo, new AuditService());

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      // Порядок как в AppModule: workspace раньше tasks — `GET /tasks/inbox` регистрируется первым.
      controllers: [WorkspaceController, TasksController],
      providers: [
        TenantGuard,
        PermissionGuard,
        { provide: IamService, useValue: iamServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: TasksService, useValue: service },
        { provide: WorkspaceService, useValue: workspaceServiceStub }
      ]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule, { abortOnError: false });
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  const makeToken = (sub = 'u_admin') =>
    issueSignedAccessToken(
      { sub, tenant_id: 'tenant_demo', session_id: 's1', roles: ['curator'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );

  const call = (path: string, init: RequestInit & { token?: string | null } = {}) =>
    fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        ...(init.token === null ? {} : { authorization: `Bearer ${init.token ?? makeToken()}` }),
        ...(init.headers ?? {})
      }
    });

  it('GET /tasks без токена — 401 auth_required в конверте', async () => {
    const response = await call('/tasks', { token: null });

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('auth_required');
  });

  it('POST /tasks без tasks.write — 403 permission_denied', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['tasks.read']);

    const response = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'x' }) });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
    expect(payload.meta.requestId).toBeTruthy();
  });

  it('POST /tasks создаёт задачу, GET /tasks отдаёт её в конверте; пустое название — 400 validation_error', async () => {
    const created = await call('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Позвонить заказчику', assigneeIds: ['u_worker'] })
    });
    expect(created.status).toBe(201);
    const createdPayload = (await created.json()) as { data: { id: string; status: string } };
    expect(createdPayload.data.status).toBe('new');

    const list = await call('/tasks?filter=created_by_me');
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as {
      data: { items: Array<{ id: string }>; total: number };
      meta: { correlationId: string };
    };
    expect(listPayload.data.items.map((t) => t.id)).toContain(createdPayload.data.id);
    expect(listPayload.meta.correlationId).toBeTruthy();

    const bad = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: '' }) });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('validation_error');
  });

  it('filter=all без manage_all — 403 task_filter_all_forbidden; с ним — 200', async () => {
    const forbidden = await call('/tasks?filter=all');
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe(
      'task_filter_all_forbidden'
    );

    iamServiceMock.resolvePermissions.mockResolvedValueOnce([
      'tasks.read',
      'tasks.write',
      'tasks.manage_all'
    ]);
    const allowed = await call('/tasks?filter=all');
    expect(allowed.status).toBe(200);
  });

  it('переход исполнителем и комментарий: POST /tasks/:id/start, POST /tasks/:id/comments', async () => {
    const created = await call('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Собрать документы', assigneeIds: ['u_worker'] })
    });
    const { data: task } = (await created.json()) as { data: { id: string } };

    const started = await call(`/tasks/${task.id}/start`, {
      method: 'POST',
      token: makeToken('u_worker')
    });
    expect(started.status).toBe(201);
    expect(((await started.json()) as { data: { status: string } }).data.status).toBe(
      'in_progress'
    );

    const comment = await call(`/tasks/${task.id}/comments`, {
      method: 'POST',
      token: makeToken('u_worker'),
      body: JSON.stringify({ text: 'Половина готова' })
    });
    expect(comment.status).toBe(201);

    const comments = await call(`/tasks/${task.id}/comments`);
    expect(((await comments.json()) as { data: { items: unknown[] } }).data.items).toHaveLength(1);
  });

  it('GET /tasks/inbox остаётся за WorkspaceController, а не за GET /tasks/:id', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['workspace.read']);

    const response = await call('/tasks/inbox');

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { items: Array<{ id: string }> } };
    expect(payload.data.items[0]?.id).toBe('doc_task_1');
    expect(workspaceServiceStub.getTasksInbox).toHaveBeenCalled();
  });

  it('неизвестный отбор — 400 validation_error; чужой id — 404 task_not_found', async () => {
    const bad = await call('/tasks?filter=everything');
    expect(bad.status).toBe(400);

    const missing = await call('/tasks/task_missing');
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'task_not_found'
    );
  });
});
