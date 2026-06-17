import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

// Shared base (mirrors env.test.ts baseEnv — NO auth/session secrets here).
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
// values (which the prod/staging refinement rejects). Every other production-required field set,
// so the only reason a parse fails is the field under test. Mirrors env.test.ts strictValidEnv.
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
  // ESIA_STATE_SECRET defaults to a dev value the strict-profile refinement rejects (added by
  // PR #258); set a non-dev value so staging/prod fixtures parse for reasons unrelated to it.
  ESIA_STATE_SECRET: 'prod-esia-state-secret-ok'
} as const;

describe('EXPORT_SIGN_* env', () => {
  it('defaults to noop + disabled', () => {
    const env = backendEnvSchema.parse({ ...devBase });
    expect(env.EXPORT_SIGN_ENABLED).toBe(false);
    expect(env.EXPORT_SIGN_PROVIDER).toBe('noop');
    expect(env.EXPORT_SIGN_SIGNER_NAME).toBe('CDOProf');
  });

  it('never coerces the string "false" to true', () => {
    const env = backendEnvSchema.parse({ ...devBase, EXPORT_SIGN_ENABLED: 'false' });
    expect(env.EXPORT_SIGN_ENABLED).toBe(false);
  });

  it('allows EXPORT_SIGN_PROVIDER=fake in development', () => {
    const env = backendEnvSchema.parse({
      ...devBase,
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'fake'
    });
    expect(env.EXPORT_SIGN_PROVIDER).toBe('fake');
  });

  it('allows EXPORT_SIGN_PROVIDER=fake in staging', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictBase,
      NODE_ENV: 'staging',
      DEPLOYMENT_PROFILE: 'staging',
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.EXPORT_SIGN_PROVIDER).toBe('fake');
  });

  it('rejects EXPORT_SIGN_PROVIDER=fake in production', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictBase,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod',
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(JSON.stringify(parsed.error.issues)).toMatch(/fake.*production|production.*fake/i);
  });

  it('allows EXPORT_SIGN_PROVIDER=cryptopro in production', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictBase,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod',
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'cryptopro'
    });
    expect(parsed.success).toBe(true);
  });
});
