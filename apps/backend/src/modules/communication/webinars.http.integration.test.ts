import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { WebinarsService } from './webinars.service.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import {
  NoopWebinarProvider,
  type WebinarProvider,
  type WebinarProviderCode,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

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

describe('Webinars webhook HTTP integration (tenant-from-session, unguarded)', () => {
  let app: { close: () => Promise<void> } | undefined;
  let apiBaseUrl = '';

  beforeAll(async () => {
    const [nestjsCore, nestjsCommon, throttlerImport] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler')
    ]);
    const { WebinarsWebhookController } = await import('./webinars-webhook.controller.js');

    const { NestFactory } = nestjsCore;
    const { Body, Controller, Get, Module, Post } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;

    // Hand-built singletons: an in-memory repo + a `fake`-enabled resolver for tenant t1.
    const settings = new WebinarProviderSettingsService(
      new InMemoryWebinarProviderSettingsRepository()
    );
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    const registry: WebinarProviderRegistry = new Map<WebinarProviderCode, WebinarProvider>([
      ['noop', new NoopWebinarProvider()],
      ['fake', new FakeWebinarProvider()]
    ]);
    const resolver = new WebinarProviderResolver(registry, settings, true, 'staging');
    const service = new WebinarsService(
      new InMemoryWebinarsState(),
      { publish() {} } as never,
      resolver
    );

    // Seed controller drives the flow without the guarded WebinarsController. It shares the SAME
    // WebinarsService singleton (and therefore the same in-memory state) as the webhook controller.
    @Controller('webinars-test')
    class SeedController {
      @Post('seed')
      async seed(@Body() body: { tenantId: string }) {
        const w = await service.create(body.tenantId, 'u1', {
          title: 'Intro',
          plannedStartAt: '2026-07-01T10:00:00.000Z',
          plannedEndAt: '2026-07-01T11:00:00.000Z'
        });
        await service.addParticipant(body.tenantId, w.id, {
          learnerId: 'l1',
          roleCode: 'attendee',
          attendanceStatus: 'invited'
        });
        return w;
      }
      @Get('parts')
      async parts() {
        const first = (await service.list('t1', {})).items[0]!;
        return service.listParticipants('t1', first.id, {});
      }
    }

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [WebinarsWebhookController, SeedController],
      providers: [
        { provide: WebinarsService, useValue: service },
        { provide: WebinarProviderResolver, useValue: resolver }
      ]
    })
    class TestAppModule {}

    const created = await NestFactory.create(TestAppModule, { logger: false });
    await created.listen(0, '127.0.0.1');
    const address = created.getHttpServer().address() as { port: number };
    apiBaseUrl = `http://127.0.0.1:${address.port}`;
    app = created;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('records attendance from a fake webhook resolved by provider_session_id', async () => {
    const seedRes = await fetch(`${apiBaseUrl}/webinars-test/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: 't1' })
    });
    expect(seedRes.status).toBeLessThan(300);
    const seeded = (await seedRes.json()) as { providerSessionId: string };
    expect(seeded.providerSessionId).toContain('fake-webinar:');

    const hookRes = await fetch(`${apiBaseUrl}/webinars/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerSessionId: seeded.providerSessionId,
        events: [
          { participantRef: 'l1', type: 'joined', occurredAt: '2026-07-01T10:00:00.000Z' },
          {
            participantRef: 'l1',
            type: 'left',
            occurredAt: '2026-07-01T10:30:00.000Z',
            durationSeconds: 1800
          }
        ]
      })
    });
    expect(hookRes.status).toBeLessThan(300);
    expect(((await hookRes.json()) as { ok: boolean }).ok).toBe(true);

    const partsRes = await fetch(`${apiBaseUrl}/webinars-test/parts`);
    const parts = (await partsRes.json()) as {
      items: { attendanceStatus: string; durationSeconds: number }[];
    };
    expect(parts.items[0]!.attendanceStatus).toBe('left');
    expect(parts.items[0]!.durationSeconds).toBe(1800);
  });

  it('no-ops for an unknown provider_session_id', async () => {
    const res = await fetch(`${apiBaseUrl}/webinars/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerSessionId: 'fake-webinar:missing', events: [] })
    });
    expect(res.status).toBeLessThan(300);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});
