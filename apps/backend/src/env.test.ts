import { describe, expect, it } from 'vitest';
import { backendEnvSchema } from './env.js';

describe('backend env production hardening', () => {
  it('rejects development auth secret in production', () => {
    expect(() =>
      backendEnvSchema.parse({
        NODE_ENV: 'production',
        RELEASE_VERSION: '1.0.0',
        BACKEND_PORT: 3001,
        API_PREFIX: '/api/v1',
        DATABASE_URL: 'http://postgres.local',
        REDIS_URL: 'http://redis.local',
        RABBITMQ_URL: 'http://rabbit.local',
        S3_ENDPOINT: 'http://s3.local',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
        S3_BUCKET: 'bucket',
        AUTH_JWT_SECRET: 'change-me-in-production',
        SESSION_SECRET: 'very-secure-session',
        CORS_ORIGIN: 'http://localhost:3000',
        PUBLIC_BASE_URL: 'http://localhost:3001',
        REALTIME_PUBLIC_URL: 'http://localhost:3002'
      })
    ).toThrow();
  });
});
