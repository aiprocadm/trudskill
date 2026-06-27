/**
 * Phase 9 Plan A — ScormContentController HTTP integration test.
 * Boots a real NestJS app with ScormContentController + mocked S3StorageClient.
 * This test is the source of truth for the wildcard param shape in NestJS 11 / path-to-regexp v8.
 */

import 'reflect-metadata';

import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Set required env vars BEFORE any application code is imported.
const SCORM_SECRET = 'test-scorm-secret-for-http-integration';
process.env.NODE_ENV = 'test';
process.env.BACKEND_PORT = '3001';
process.env.API_PREFIX = '/api/v1';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_ACCESS_KEY = 'minio';
process.env.S3_SECRET_KEY = 'minio123';
process.env.S3_BUCKET = 'test';
process.env.AUTH_JWT_SECRET = 'secret_value_123';
process.env.SESSION_SECRET = 'session_secret_123';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.REALTIME_PUBLIC_URL = 'ws://localhost:3000';
process.env.REALTIME_PUBLISH_KEY = 'test-realtime-publish-key';
process.env.DB_MIGRATIONS_ENABLED = 'false';
process.env.ALLOW_IN_MEMORY_STATE = 'true';
process.env.SCORM_CONTENT_TOKEN_SECRET = SCORM_SECRET;

describe('ScormContentController (HTTP integration)', () => {
  let app:
    | { close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } }
    | undefined;
  let apiBaseUrl = '';
  let getObjectStreamMock: ReturnType<typeof vi.fn>;

  // Token factory: creates a valid HMAC token inline to avoid circular import ordering issues.
  let makeToken: (opts?: { alreadyExpiredBySeconds?: number }) => string;

  beforeAll(async () => {
    const [
      nestjsCore,
      nestjsCommon,
      throttlerImport,
      filterImport,
      s3ClientImport,
      controllerImport,
      tokenImport
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/common'),
      import('@nestjs/throttler'),
      import('../../../common/filters/http-exception.filter.js'),
      import('../../../infrastructure/storage/s3-storage.client.js'),
      import('./scorm-content.controller.js'),
      import('./scorm-content-token.js')
    ]);

    const { NestFactory } = nestjsCore;
    const { Module } = nestjsCommon;
    const { ThrottlerModule } = throttlerImport;
    const { HttpExceptionEnvelopeFilter } = filterImport;
    const { S3StorageClient } = s3ClientImport;
    const { ScormContentController } = controllerImport;
    const { createScormContentToken } = tokenImport;

    getObjectStreamMock = vi
      .fn()
      .mockResolvedValue(Readable.from(Buffer.from('<html><body>SCORM content</body></html>')));

    const s3Mock = {
      getObjectStream: getObjectStreamMock,
      putObject: vi.fn(),
      deleteObject: vi.fn(),
      listObjectKeys: vi.fn().mockResolvedValue([]),
      createPresignedUploadUrl: vi.fn(),
      createPresignedDownloadUrl: vi.fn(),
      ping: vi.fn()
    };

    makeToken = (opts = {}) => {
      const now = Math.floor(Date.now() / 1000);
      const alreadyExpiredBySeconds = opts.alreadyExpiredBySeconds;
      if (alreadyExpiredBySeconds !== undefined) {
        // Create a token whose expiry is alreadyExpiredBySeconds in the past.
        return createScormContentToken(
          { tenantId: 'tenant_demo', packageId: 'scp_test' },
          SCORM_SECRET,
          { ttlSeconds: -alreadyExpiredBySeconds, nowEpochSeconds: now }
        );
      }
      return createScormContentToken(
        { tenantId: 'tenant_demo', packageId: 'scp_test' },
        SCORM_SECRET,
        { ttlSeconds: 3600, nowEpochSeconds: now }
      );
    };

    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })],
      controllers: [ScormContentController],
      providers: [{ provide: S3StorageClient, useValue: s3Mock }]
    })
    class TestContentModule {}

    const created = await NestFactory.create(TestContentModule, { logger: false });
    created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    created.setGlobalPrefix((process.env.API_PREFIX ?? '/api/v1').replace(/^\//, ''));
    await created.listen(0, '127.0.0.1');

    const address = created.getHttpServer().address() as { port: number };
    apiBaseUrl = `http://127.0.0.1:${address.port}${process.env.API_PREFIX ?? '/api/v1'}`;
    app = created;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('valid token → 200, body = streamed content, Content-Type text/html for index.html', async () => {
    getObjectStreamMock.mockResolvedValueOnce(
      Readable.from(Buffer.from('<html><body>SCORM index</body></html>'))
    );
    const token = makeToken();
    const response = await fetch(`${apiBaseUrl}/scorm-content/${token}/index.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    const body = await response.text();
    expect(body).toContain('SCORM index');
  });

  it('valid token with multi-segment path → 200, getObjectStream called with correct key', async () => {
    getObjectStreamMock.mockResolvedValueOnce(Readable.from(Buffer.from('console.log("app");')));
    const token = makeToken();
    const response = await fetch(`${apiBaseUrl}/scorm-content/${token}/content/js/app.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript');
    // Verify the S3 key contains the full path
    const [lastCall] = getObjectStreamMock.mock.calls.slice(-1);
    expect(lastCall[0].key).toBe('scorm/tenant_demo/scp_test/content/js/app.js');
  });

  it('expired token → 404 (no details)', async () => {
    // Create a token that expired 10 seconds in the past
    const token = makeToken({ alreadyExpiredBySeconds: 10 });
    const response = await fetch(`${apiBaseUrl}/scorm-content/${token}/index.html`);

    expect(response.status).toBe(404);
    // The error envelope must not leak internals
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('forged signature → 404', async () => {
    const validToken = makeToken();
    const [bodyPart] = validToken.split('.');
    const forgedToken = `${bodyPart}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const response = await fetch(`${apiBaseUrl}/scorm-content/${forgedToken}/index.html`);

    expect(response.status).toBe(404);
  });

  it('path with .. segment → 404 and getObjectStream NOT called', async () => {
    const callsBefore = getObjectStreamMock.mock.calls.length;
    const token = makeToken();
    const response = await fetch(
      `${apiBaseUrl}/scorm-content/${token}/content/../../../etc/passwd`
    );

    expect(response.status).toBe(404);
    // getObjectStream must not be called for traversal paths
    expect(getObjectStreamMock.mock.calls.length).toBe(callsBefore);
  });

  it('S3 getObjectStream rejects → 404', async () => {
    getObjectStreamMock.mockRejectedValueOnce(new Error('NoSuchKey'));
    const token = makeToken();
    const response = await fetch(`${apiBaseUrl}/scorm-content/${token}/missing.html`);

    expect(response.status).toBe(404);
  });

  it('request without any auth headers succeeds (unguarded route — D6 contract)', async () => {
    getObjectStreamMock.mockResolvedValueOnce(Readable.from(Buffer.from('<html>ok</html>')));
    const token = makeToken();
    // No Authorization header, no x-tenant-id header — must still return 200.
    const response = await fetch(`${apiBaseUrl}/scorm-content/${token}/index.html`);

    expect(response.status).toBe(200);
  });
});
