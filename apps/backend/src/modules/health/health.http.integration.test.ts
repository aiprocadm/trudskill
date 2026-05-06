import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { INestApplication } from '@nestjs/common';

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
  ALLOW_IN_MEMORY_STATE: 'true',
  READINESS_QUEUE_BACKLOG_THRESHOLD: '100',
  READINESS_QUEUE_LAG_SECONDS_THRESHOLD: '30',
  READINESS_OUTBOX_BACKLOG_THRESHOLD: '50'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

type HealthHttpHarness = {
  app: INestApplication;
  apiBaseUrl: string;
};

async function bootstrapHealthHttpApp(opts: {
  migrationReadinessHealthy: boolean;
}): Promise<HealthHttpHarness> {
  const [
    nestjsCore,
    nestjsCommon,
    throttlerImport,
    filterImport,
    contextInterceptorImport,
    envelopeImport,
    databaseServiceImport,
    redisServiceImport,
    rabbitServiceImport,
    s3Import,
    secretsServiceImport,
    healthControllerImport
  ] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/common'),
    import('@nestjs/throttler'),
    import('../../common/filters/http-exception.filter.js'),
    import('../../common/interceptors/request-context.interceptor.js'),
    import('../../common/interceptors/response-envelope.interceptor.js'),
    import('../../infrastructure/database/database.service.js'),
    import('../../infrastructure/cache/redis.service.js'),
    import('../../infrastructure/messaging/rabbitmq.service.js'),
    import('../../infrastructure/storage/s3-storage.client.js'),
    import('../../infrastructure/secrets/secrets.service.js'),
    import('./health.controller.js')
  ]);

  const { NestFactory } = nestjsCore;
  const { Module } = nestjsCommon;
  const { ThrottlerModule } = throttlerImport;
  const { HttpExceptionEnvelopeFilter } = filterImport;
  const { RequestContextInterceptor } = contextInterceptorImport;
  const { ResponseEnvelopeInterceptor } = envelopeImport;
  const { DatabaseService } = databaseServiceImport;
  const { RedisService } = redisServiceImport;
  const { RabbitMqService } = rabbitServiceImport;
  const { S3StorageClient } = s3Import;
  const { SecretsService } = secretsServiceImport;
  const { HealthController } = healthControllerImport;

  const dbMock = {
    ping: async () => true,
    getMigrationReadiness: async () =>
      opts.migrationReadinessHealthy
        ? {
            healthy: true,
            appliedCount: 3,
            pendingCount: 0,
            pending: [] as string[]
          }
        : {
            healthy: false,
            appliedCount: 2,
            pendingCount: 1,
            pending: ['0018_migration_backfill_control.sql']
          },
    getQueueReadiness: async () => ({
      connected: true,
      backlog: 3,
      lagSeconds: 12,
      backlogThreshold: 100,
      lagThresholdSeconds: 30,
      healthy: true
    }),
    getOutboxReadiness: async () => ({
      backlog: 1,
      backlogThreshold: 50,
      healthy: true
    })
  };

  const redisMock = {
    ping: async () => true
  };

  const rabbitMock = {
    ping: async () => true
  };

  const storageMock = {
    ping: async () => ({ provider: 's3-compatible', healthy: true })
  };

  const secretsMock = {
    getRotationPolicy: () => ({
      provider: 'env',
      maxAgeDays: 30,
      keyRefs: { authJwt: 'auth.jwt', session: 'session.cookie' }
    })
  };

  @Module({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
    controllers: [HealthController],
    providers: [
      { provide: DatabaseService, useValue: dbMock },
      { provide: RedisService, useValue: redisMock },
      { provide: RabbitMqService, useValue: rabbitMock },
      { provide: S3StorageClient, useValue: storageMock },
      { provide: SecretsService, useValue: secretsMock }
    ]
  })
  class TestHealthAppModule {}

  const created = await NestFactory.create(TestHealthAppModule, { logger: false });
  created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
  created.useGlobalInterceptors(new RequestContextInterceptor(), new ResponseEnvelopeInterceptor());
  created.setGlobalPrefix((process.env.API_PREFIX ?? '/api/v1').replace(/^\//, ''));
  await created.listen(0, '127.0.0.1');

  const address = created.getHttpServer().address() as { port: number };
  const apiBaseUrl = `http://127.0.0.1:${address.port}${process.env.API_PREFIX ?? '/api/v1'}`;
  return { app: created, apiBaseUrl };
}

describe('Health HTTP integration (liveness + ready success)', () => {
  let app: INestApplication | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const harness = await bootstrapHealthHttpApp({ migrationReadinessHealthy: true });
    app = harness.app;
    apiBaseUrl = harness.apiBaseUrl;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health/live returns 200 and envelope payload without auth', async () => {
    const response = await fetch(`${apiBaseUrl}/health/live`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { status: string; service: string };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.status).toBe('ok');
    expect(payload.data.service).toBe('backend');
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('GET /health/ready returns 200 and envelope when dependency checks pass (no auth)', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { status: string; checks: { database: { connected: boolean } } };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(payload.data.status).toBe('ok');
    expect(payload.data.checks.database.connected).toBe(true);
    expect(payload.meta.requestId).toBeTruthy();
    expect(payload.meta.correlationId).toBeTruthy();
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('Health HTTP integration (readiness failure envelope)', () => {
  let app: INestApplication | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const harness = await bootstrapHealthHttpApp({ migrationReadinessHealthy: false });
    app = harness.app;
    apiBaseUrl = harness.apiBaseUrl;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health/live stays 200 when readiness dependencies are degraded', async () => {
    const response = await fetch(`${apiBaseUrl}/health/live`);
    expect(response.status).toBe(200);
  });

  it('GET /health/ready returns 503 with error envelope when migrations unhealthy', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error: {
        code: string;
        message: string;
        checks: { database: { migrations: { healthy: boolean; pendingCount: number } } };
      };
      meta: { requestId: string; correlationId: string; timestamp: string };
    };
    expect(body.error.code).toBe('readiness_failed');
    expect(body.error.checks.database.migrations.healthy).toBe(false);
    expect(body.error.checks.database.migrations.pendingCount).toBeGreaterThanOrEqual(1);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.meta.correlationId).toBeTruthy();
  });
});
