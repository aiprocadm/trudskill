import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

// Shared base (mirrors env.export-sign.test.ts baseEnv — NO auth/session secrets here).
const baseEnv = {
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
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3001',
  REALTIME_PUBLIC_URL: 'http://localhost:3002',
  REALTIME_PUBLISH_KEY: 'prod-realtime-publish-key'
} as const;

// Dev fixture — explicit non-placeholder dev secrets (SECRETS_PROVIDER defaults to env in dev).
const devBase = {
  ...baseEnv,
  AUTH_JWT_SECRET: 'dev-secret-not-placeholder',
  SESSION_SECRET: 'dev-session-not-placeholder'
} as const;

// Strict (prod/staging-eligible) fixture — secrets come from vault, so NO dev AUTH/SESSION
// values. Every other production-required field set so the only reason a parse fails is the
// field under test. Mirrors env.export-sign.test.ts strictBase.
const strictBase = {
  ...baseEnv,
  SECRETS_PROVIDER: 'vault',
  VAULT_ADDR: 'https://vault.internal',
  VAULT_TOKEN: 'vault-token-123456',
  INTEGRATION_WEBHOOK_SECRET: 'prod-webhook-secret-ok',
  MVP_PERSISTENCE_DRIVER: 'postgres',
  DOCUMENTS_PERSISTENCE_DRIVER: 'postgres',
  ALLOW_IN_MEMORY_STATE: false,
  SCORM_CONTENT_TOKEN_SECRET: 'prod-scorm-content-token-secret',
  ESIA_STATE_SECRET: 'prod-esia-state-secret-ok'
} as const;

describe('PAYMENTS_* env', () => {
  it('defaults to disabled + RUB; PAYMENTS_PROVIDER no longer exists', () => {
    const env = backendEnvSchema.parse({ ...devBase });
    expect(env.PAYMENTS_ENABLED).toBe(false);
    expect(env.PAYMENTS_CURRENCY).toBe('RUB');
    expect('PAYMENTS_PROVIDER' in env).toBe(false);
  });

  it('never coerces the string "false" to true', () => {
    const env = backendEnvSchema.parse({ ...devBase, PAYMENTS_ENABLED: 'false' });
    expect(env.PAYMENTS_ENABLED).toBe(false);
  });

  it('parses ЮKassa credentials when provided', () => {
    const env = backendEnvSchema.parse({
      ...devBase,
      PAYMENTS_ENABLED: 'true',
      YOOKASSA_SHOP_ID: 'shop-1',
      YOOKASSA_SECRET_KEY: 'sk-live-xxx',
      YOOKASSA_RETURN_URL: 'https://lms.example.ru/payments/return'
    });
    expect(env.YOOKASSA_SHOP_ID).toBe('shop-1');
    expect(env.YOOKASSA_API_BASE).toBe('https://api.yookassa.ru/v3');
    expect(env.YOOKASSA_WEBHOOK_IP_CHECK).toBe(true);
  });

  it('parses with no acquirer creds even when enabled (adapters are credential-gated at runtime)', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictBase,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod',
      PAYMENTS_ENABLED: 'true'
    });
    expect(parsed.success).toBe(true);
  });
});
