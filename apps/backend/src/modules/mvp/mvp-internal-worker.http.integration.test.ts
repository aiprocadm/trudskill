import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { INestApplication } from '@nestjs/common';

const CALLBACK_SECRET = 'test_worker_callback_secret_16';

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
  ALLOW_IN_MEMORY_STATE: 'true',
  WORKER_CALLBACK_SECRET: CALLBACK_SECRET
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

describe('MVP internal worker HTTP (bulk callback)', () => {
  let app: INestApplication | undefined;
  let apiBaseUrl = '';
  const createBulkEnrollmentsSpy = vi.fn();

  beforeEach(() => {
    createBulkEnrollmentsSpy.mockReturnValue({
      groupId: 'grp_worker_stub',
      idempotencyKey: 'idem_stub',
      created: [],
      skippedExisting: [],
      errors: []
    });
  });

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      filterImport,
      contextInterceptorImport,
      envelopeImport,
      { MvpInternalWorkerController },
      { WorkerCallbackGuard },
      { MvpService }
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('./mvp-internal-worker.controller.js'),
      import('./infrastructure/worker-callback.guard.js'),
      import('./mvp.service.js')
    ]);

    const { NestFactory, Reflector } = nestjsCore;
    const { Module } = nestjsCommon;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;

    @Module({
      controllers: [MvpInternalWorkerController],
      providers: [
        Reflector,
        WorkerCallbackGuard,
        { provide: MvpService, useValue: { createBulkEnrollments: createBulkEnrollmentsSpy } }
      ]
    })
    class InternalWorkerHarnessModule {}

    const nest = await NestFactory.create(InternalWorkerHarnessModule, { logger: false });
    nest.setGlobalPrefix('api/v1');
    nest.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    nest.useGlobalInterceptors(new RequestContextInterceptor(), new ResponseEnvelopeInterceptor());
    await nest.init();
    await nest.listen(0);

    app = nest;
    const address = nest.getHttpServer().address();
    const port =
      typeof address === 'object' && address && 'port' in address ? Number(address.port) : 0;
    apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  const workerPath = () => `${apiBaseUrl}/internal/worker/mvp/bulk-enrollments`;

  const validBody = () => ({
    tenantId: 'tenant_demo',
    requestId: 'req-internal-worker-1',
    correlationId: 'corr-internal-worker-1',
    payload: {
      actorId: 'u_worker_actor',
      idempotencyKey: 'bulk-worker-idem-1',
      groupId: 'grp_worker_1',
      learnerIds: ['lrn_a', 'lrn_b'],
      organizationUnitId: 'ou_workers'
    }
  });

  it('returns 403 when x-worker-callback-token is missing', async () => {
    const res = await fetch(workerPath(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody())
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as {
      error: { code?: string; message?: string };
    };
    expect(json.error.code).toBe('forbidden');
    expect(createBulkEnrollmentsSpy).not.toHaveBeenCalled();
  });

  it('returns 403 when callback token does not match', async () => {
    const res = await fetch(workerPath(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-callback-token': 'wrong-secret-value-min8'
      },
      body: JSON.stringify(validBody())
    });
    expect(res.status).toBe(403);
    expect(createBulkEnrollmentsSpy).not.toHaveBeenCalled();
  });

  it('returns validation_error when body is incomplete', async () => {
    const res = await fetch(workerPath(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-callback-token': CALLBACK_SECRET
      },
      body: JSON.stringify({
        tenantId: 'tenant_demo',
        payload: {}
      })
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code?: string } };
    expect(json.error.code).toBe('validation_error');
    expect(createBulkEnrollmentsSpy).not.toHaveBeenCalled();
  });

  it('proxies to MvpService.createBulkEnrollments with deliveryMode immediate', async () => {
    const res = await fetch(workerPath(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-callback-token': CALLBACK_SECRET
      },
      body: JSON.stringify(validBody())
    });
    expect([200, 201]).toContain(res.status);

    expect(createBulkEnrollmentsSpy).toHaveBeenCalledTimes(1);
    expect(createBulkEnrollmentsSpy).toHaveBeenCalledWith(
      'tenant_demo',
      'u_worker_actor',
      expect.objectContaining({
        idempotencyKey: 'bulk-worker-idem-1',
        groupId: 'grp_worker_1',
        learnerIds: ['lrn_a', 'lrn_b'],
        organizationUnitId: 'ou_workers',
        deliveryMode: 'immediate'
      }),
      expect.objectContaining({
        tenantId: 'tenant_demo',
        userId: 'u_worker_actor',
        requestId: 'req-internal-worker-1',
        correlationId: 'corr-internal-worker-1'
      })
    );

    const json = (await res.json()) as { data: { idempotencyKey: string }; meta: unknown };
    expect(json.data.idempotencyKey).toBe('idem_stub');
    expect(json.meta).toMatchObject({
      requestId: expect.any(String),
      correlationId: expect.any(String)
    });
  });

  it('defaults empty learnerIds when omitted', async () => {
    const body = validBody();
    delete (body.payload as { learnerIds?: string[] }).learnerIds;

    await fetch(workerPath(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-callback-token': CALLBACK_SECRET
      },
      body: JSON.stringify(body)
    });

    expect(createBulkEnrollmentsSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ learnerIds: [] }),
      expect.any(Object)
    );
  });
});
