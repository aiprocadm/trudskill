import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const requiredEnv: Record<string, string> = {
  NODE_ENV: 'test',
  API_PREFIX: '/api/v1',
  AUTH_JWT_SECRET: 'secret_value_123',
  SESSION_SECRET: 'session_secret_123',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  REALTIME_PUBLIC_URL: 'ws://localhost:3000',
  REALTIME_PUBLISH_KEY: 'test-realtime-publish-key',
  DB_MIGRATIONS_ENABLED: 'false',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

describe('Integrations API contract', () => {
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
      envelopeImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js')
    ]);

    const { NestFactory } = nestjsCore;
    const { Controller, Get, Module, ValidationPipe } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { RequestContextInterceptor } = contextInterceptorImport;
    const { ResponseEnvelopeInterceptor } = envelopeImport;

    @Controller()
    class TestIntegrationsController {
      @Get('integrations/diagnostics')
      diagnostics() {
        return {
          items: [
            {
              providerId: 'prov_1',
              providerCode: 'frdo',
              providerType: 'frdo',
              providerActive: true,
              credentialsCount: 1,
              activeCredentials: 1,
              lastSyncStatus: 'success',
              lastSyncAt: new Date().toISOString()
            }
          ]
        };
      }

      @Get('exports/tasks')
      tasks() {
        return {
          items: [
            {
              id: 'exp_1',
              providerCode: 'frdo',
              exportType: 'learners',
              status: 'completed'
            }
          ]
        };
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [TestIntegrationsController]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule);
    created.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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

  it('matches contract for GET /integrations/diagnostics', async () => {
    const response = await fetch(`${apiBaseUrl}/integrations/diagnostics`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    const schema = z.object({
      data: z.object({
        items: z.array(
          z.object({
            providerId: z.string().min(1),
            providerCode: z.string().min(1),
            providerType: z.string().min(1),
            providerActive: z.boolean(),
            credentialsCount: z.number().int().nonnegative(),
            activeCredentials: z.number().int().nonnegative(),
            lastSyncStatus: z.string().min(1),
            lastSyncAt: z.string().nullable()
          })
        )
      }),
      meta: z.object({
        requestId: z.string().min(1),
        correlationId: z.string().min(1),
        timestamp: z.string().min(1)
      })
    });
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it('matches contract for GET /exports/tasks', async () => {
    const response = await fetch(`${apiBaseUrl}/exports/tasks`, {
      headers: { 'x-tenant-id': 'tenant_demo' }
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    const schema = z.object({
      data: z.object({
        items: z.array(
          z.object({
            id: z.string().min(1),
            providerCode: z.string().min(1),
            exportType: z.string().min(1),
            status: z.string().min(1)
          })
        )
      }),
      meta: z.object({
        requestId: z.string().min(1),
        correlationId: z.string().min(1),
        timestamp: z.string().min(1)
      })
    });
    expect(schema.safeParse(payload).success).toBe(true);
  });
});
