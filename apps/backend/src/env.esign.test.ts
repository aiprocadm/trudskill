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

/** Full prod-valid base — satisfies all strict-profile env guards (vault, postgres, non-dev secrets). */
const prodBase = {
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
  REALTIME_PUBLISH_KEY: 'prod-realtime-publish-key',
  NODE_ENV: 'production',
  DEPLOYMENT_PROFILE: 'prod',
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

describe('ESIGN env flags', () => {
  it('defaults to disabled / noop', () => {
    const env = backendEnvSchema.parse({ ...base });
    expect(env.ESIGN_ENABLED).toBe(false);
    expect(env.ESIGN_PROVIDER).toBe('noop');
  });

  it('does not enable on the string "false"', () => {
    const env = backendEnvSchema.parse({ ...base, ESIGN_ENABLED: 'false' });
    expect(env.ESIGN_ENABLED).toBe(false);
  });

  it('enables on "true" and accepts a provider + signer name', () => {
    const env = backendEnvSchema.parse({
      ...base,
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'cryptopro',
      ESIGN_SIGNER_NAME: 'ООО Учебный Центр'
    });
    expect(env.ESIGN_ENABLED).toBe(true);
    expect(env.ESIGN_PROVIDER).toBe('cryptopro');
    expect(env.ESIGN_SIGNER_NAME).toBe('ООО Учебный Центр');
  });

  it('allows ESIGN_PROVIDER=fake in development', () => {
    const env = backendEnvSchema.parse({
      ...base,
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'fake'
    });
    expect(env.ESIGN_PROVIDER).toBe('fake');
  });

  it('rejects ESIGN_PROVIDER=fake in production', () => {
    const parsed = backendEnvSchema.safeParse({
      ...prodBase,
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages.some((m) => /fake.*production|production.*fake/i.test(m))).toBe(true);
    }
  });

  it('allows ESIGN_PROVIDER=fake in staging (deliberate — owner preview env)', () => {
    // NODE_ENV=staging triggers isStrictProfile (vault + postgres + non-dev secrets required).
    // DEPLOYMENT_PROFILE=staging avoids the prod↔production parity check.
    // prodBase already satisfies all strict-profile guards; we just swap the profile pair.
    const parsed = backendEnvSchema.safeParse({
      ...prodBase,
      NODE_ENV: 'staging',
      DEPLOYMENT_PROFILE: 'staging',
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ESIGN_PROVIDER).toBe('fake');
    }
  });
});
