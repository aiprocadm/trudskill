import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://localhost:5672',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 'b',
  S3_BUCKET: 'bucket',
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3001',
  REALTIME_PUBLIC_URL: 'http://localhost:3002',
  REALTIME_PUBLISH_KEY: 'dev-realtime-key-12345',
  AUTH_JWT_SECRET: 'dev-jwt-secret-12345',
  SESSION_SECRET: 'dev-session-secret-12345'
};

describe('ESIA env flags', () => {
  it('defaults dormant: ESIA_ENABLED=false, provider=noop', () => {
    const env = backendEnvSchema.parse({ ...base });
    expect(env.ESIA_ENABLED).toBe(false);
    expect(env.ESIA_PROVIDER).toBe('noop');
  });

  it('treats the string "false" as false (never accidentally on)', () => {
    const env = backendEnvSchema.parse({ ...base, ESIA_ENABLED: 'false' });
    expect(env.ESIA_ENABLED).toBe(false);
  });

  it('enables only on explicit true', () => {
    const env = backendEnvSchema.parse({ ...base, ESIA_ENABLED: 'true', ESIA_PROVIDER: 'mock' });
    expect(env.ESIA_ENABLED).toBe(true);
    expect(env.ESIA_PROVIDER).toBe('mock');
  });
});
