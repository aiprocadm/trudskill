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

describe('Payments HTTP integration (permission boundaries + unguarded webhook)', () => {
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
    resolvePermissions: vi.fn().mockResolvedValue(['payments.read'])
  };

  // Stub order returned by the service
  const STUB_ORDER = {
    id: 'ord_stub_1',
    tenantId: 'tenant_demo',
    buyerType: 'learner',
    buyerId: 'u_learner_1',
    status: 'draft',
    currency: 'RUB',
    totalAmount: 50000,
    items: [],
    createdBy: 'u_admin_1',
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z'
  };

  const paymentsServiceStub = {
    createOrder: vi.fn().mockResolvedValue(STUB_ORDER),
    getOrder: vi.fn().mockResolvedValue(STUB_ORDER),
    listOrders: vi.fn().mockResolvedValue([STUB_ORDER]),
    pay: vi.fn().mockResolvedValue({ ...STUB_ORDER, status: 'awaiting_payment' }),
    markPaid: vi.fn().mockResolvedValue({ ...STUB_ORDER, status: 'paid' }),
    cancelOrder: vi.fn().mockResolvedValue({ ...STUB_ORDER, status: 'cancelled' })
  };

  const paymentsRepoStub = {
    createOrder: vi.fn().mockResolvedValue(STUB_ORDER),
    getOrder: vi.fn().mockResolvedValue(STUB_ORDER),
    listOrders: vi.fn().mockResolvedValue([]),
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    createPayment: vi.fn().mockResolvedValue({}),
    updatePaymentStatus: vi.fn().mockResolvedValue(undefined),
    findOrderByProviderPaymentId: vi.fn().mockResolvedValue(null),
    markItemFulfilled: vi.fn().mockResolvedValue(undefined)
  };

  const fakeProviderStub = {
    code: 'fake',
    createPayment: vi.fn().mockResolvedValue({ providerPaymentId: '', status: 'disabled' }),
    parseWebhook: vi.fn().mockResolvedValue(null)
  };

  const fulfillmentServiceStub = {
    fulfill: vi.fn().mockResolvedValue(undefined)
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
      permissionGuardImport,
      cryptoImport,
      paymentsControllerImport,
      paymentsWebhookControllerImport,
      paymentsServiceImport,
      paymentsRepoImport,
      paymentProviderImport,
      resolverImport,
      settingsServiceImport,
      settingsRepoImport,
      fulfillmentServiceImport,
      iamServiceImport,
      authServiceImport
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
      import('./payments.controller.js'),
      import('./payments-webhook.controller.js'),
      import('./payments.service.js'),
      import('./payments.repository.js'),
      import('../../infrastructure/payments/payment.provider.js'),
      import('./payment-provider-resolver.service.js'),
      import('./payment-provider-settings.service.js'),
      import('./in-memory-payment-provider-settings.repository.js'),
      import('./payment-fulfillment.service.js'),
      import('../iam/services/iam.service.js'),
      import('../iam/services/auth.service.js')
    ]);

    issueSignedAccessToken = cryptoImport.issueSignedAccessToken;

    const { NestFactory } = nestjsCore;
    const { Module, ValidationPipe } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;
    const { TenantGuard } = tenantGuardImport;
    const { PermissionGuard } = permissionGuardImport;
    const { PaymentsController } = paymentsControllerImport;
    const { PaymentsWebhookController } = paymentsWebhookControllerImport;
    const { PaymentsService } = paymentsServiceImport;
    const { PAYMENTS_REPOSITORY } = paymentsRepoImport;
    const { PAYMENT_PROVIDER_REGISTRY, NoopPaymentProvider } = paymentProviderImport;
    const { PaymentProviderResolver } = resolverImport;
    const { PaymentProviderSettingsService } = settingsServiceImport;
    const { InMemoryPaymentProviderSettingsRepository } = settingsRepoImport;
    const { PaymentFulfillmentService } = fulfillmentServiceImport;
    const { IamService } = iamServiceImport;
    const { AuthService } = authServiceImport;

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [PaymentsController, PaymentsWebhookController],
      providers: [
        TenantGuard,
        PermissionGuard,
        {
          // Wire the mocked IamService so PermissionGuard can call resolvePermissions
          provide: IamService,
          useValue: iamServiceMock
        },
        {
          // Wire the mocked AuthService so PermissionGuard can call isSessionActive
          provide: AuthService,
          useValue: authServiceMock
        },
        {
          provide: PaymentsService,
          useValue: paymentsServiceStub
        },
        {
          provide: PAYMENTS_REPOSITORY,
          useValue: paymentsRepoStub
        },
        {
          provide: PAYMENT_PROVIDER_REGISTRY,
          useValue: new Map<string, unknown>([
            ['noop', new NoopPaymentProvider()],
            ['fake', fakeProviderStub]
          ])
        },
        {
          provide: PaymentProviderSettingsService,
          useValue: new PaymentProviderSettingsService(
            new InMemoryPaymentProviderSettingsRepository()
          )
        },
        PaymentProviderResolver,
        {
          provide: PaymentFulfillmentService,
          useValue: fulfillmentServiceStub
        }
      ]
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
    // Importing the real IamService/AuthService classes as DI tokens drags in the
    // entire IAM module graph; on the Cyrillic-path Windows dev box transform alone
    // takes ~20s, blowing the default 30s hook budget. CI (Ubuntu) boots in ~8s.
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  // === Helper to issue a signed JWT and prime the IAM mock ===
  function makeToken(permissions: string[], userId = 'u_admin_1') {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(permissions);
    return issueSignedAccessToken(
      { sub: userId, tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
  }

  const validOrderBody = {
    buyerType: 'learner',
    buyerId: 'u_learner_1',
    items: [{ groupId: 'g_1', learnerId: 'u_learner_1', unitAmount: 50000 }]
  };

  // === POST /orders permission boundary ===

  it('POST /orders: 401 without bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant_demo' },
      body: JSON.stringify(validOrderBody)
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('auth_required');
  });

  it('POST /orders: 403 without payments.write', async () => {
    const token = makeToken(['payments.read']);
    const response = await fetch(`${apiBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(validOrderBody)
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('POST /orders: 201 with payments.write', async () => {
    const token = makeToken(['payments.write']);
    const response = await fetch(`${apiBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(validOrderBody)
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string };
      meta: { requestId: string };
    };
    expect(payload.data.id).toBe('ord_stub_1');
    expect(payload.meta.requestId).toBeTruthy();
  });

  // === GET /me/orders permission boundary ===

  it('GET /me/orders: 401 without bearer token', async () => {
    const response = await fetch(`${apiBaseUrl}/me/orders`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('auth_required');
  });

  it('GET /me/orders: 403 without payments.self_purchase', async () => {
    const token = makeToken(['payments.read']);
    const response = await fetch(`${apiBaseUrl}/me/orders`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('GET /me/orders: 200 with payments.self_purchase', async () => {
    const token = makeToken(['payments.self_purchase']);
    const response = await fetch(`${apiBaseUrl}/me/orders`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: unknown[];
      meta: { requestId: string };
    };
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
  });

  // === GET /orders: requires payments.read ===

  it('GET /orders: 403 without payments.read', async () => {
    const token = makeToken(['payments.write']);
    const response = await fetch(`${apiBaseUrl}/orders`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('GET /orders: 200 with payments.read', async () => {
    const token = makeToken(['payments.read']);
    const response = await fetch(`${apiBaseUrl}/orders`, {
      headers: {
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: unknown[];
      meta: { requestId: string };
    };
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
  });

  // === Unguarded webhook: no auth required ===

  it('POST /payments/webhook/fake: reachable without any auth → 2xx { ok: true }', async () => {
    // No x-tenant-id, no Authorization — provider returns null → ok: true
    fakeProviderStub.parseWebhook.mockResolvedValueOnce(null);
    const response = await fetch(`${apiBaseUrl}/payments/webhook/fake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'payment.succeeded', id: 'pay_stub' })
    });
    // Webhook has no TenantGuard — must be 2xx
    expect(response.status).toBeLessThan(300);
    const payload = (await response.json()) as { data: { ok: boolean }; meta: unknown };
    expect(payload.data.ok).toBe(true);
  });

  it('POST /payments/webhook/fake: null-event provider path returns ok: true', async () => {
    fakeProviderStub.parseWebhook.mockResolvedValueOnce(null);
    const response = await fetch(`${apiBaseUrl}/payments/webhook/fake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(response.status).toBeLessThan(300);
    const payload = (await response.json()) as { data: { ok: boolean } };
    expect(payload.data.ok).toBe(true);
  });
});
