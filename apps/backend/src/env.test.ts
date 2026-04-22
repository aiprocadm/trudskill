import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

const baseProductionEnv = {
  NODE_ENV: 'production',
  DEPLOYMENT_PROFILE: 'prod',
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
  SECRETS_PROVIDER: 'vault',
  AUTH_JWT_SECRET_KEY_REF: 'auth.jwt',
  SESSION_SECRET_KEY_REF: 'session.cookie',
  VAULT_ADDR: 'https://vault.internal',
  VAULT_TOKEN: 'vault-token-123456',
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3001',
  REALTIME_PUBLIC_URL: 'http://localhost:3002',
  REALTIME_PUBLISH_KEY: 'prod-realtime-publish-key',
  INTEGRATION_WEBHOOK_SECRET: 'prod-webhook-secret-ok',
  MVP_PERSISTENCE_DRIVER: 'postgres',
  DOCUMENTS_PERSISTENCE_DRIVER: 'postgres',
  ALLOW_IN_MEMORY_STATE: false
} as const;

describe('backend env production hardening', () => {
  it('rejects plain env secrets provider in production', () => {
    expect(() =>
      backendEnvSchema.parse({
        ...baseProductionEnv,
        SECRETS_PROVIDER: 'env',
        AUTH_JWT_SECRET: 'change-me-in-production',
        SESSION_SECRET: 'change-me-in-production'
      })
    ).toThrow();
  });

  it('rejects production without integration webhook secret', () => {
    expect(() =>
      backendEnvSchema.parse({
        ...baseProductionEnv,
        INTEGRATION_WEBHOOK_SECRET: undefined
      })
    ).toThrow();
  });

  it('rejects non-postgres MVP driver in production', () => {
    expect(() =>
      backendEnvSchema.parse({
        ...baseProductionEnv,
        MVP_PERSISTENCE_DRIVER: 'memory'
      })
    ).toThrow();
  });

  it('rejects non-postgres documents driver in production', () => {
    expect(() =>
      backendEnvSchema.parse({
        ...baseProductionEnv,
        DOCUMENTS_PERSISTENCE_DRIVER: 'memory'
      })
    ).toThrow();
  });
});
