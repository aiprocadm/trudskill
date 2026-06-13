import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

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

const strictValidEnv = {
  ...baseEnv,
  SECRETS_PROVIDER: 'vault',
  VAULT_ADDR: 'https://vault.internal',
  VAULT_TOKEN: 'vault-token-123456',
  INTEGRATION_WEBHOOK_SECRET: 'prod-webhook-secret-ok',
  MVP_PERSISTENCE_DRIVER: 'postgres',
  DOCUMENTS_PERSISTENCE_DRIVER: 'postgres',
  ALLOW_IN_MEMORY_STATE: false,
  SCORM_CONTENT_TOKEN_SECRET: 'prod-scorm-content-token-secret'
} as const;

const issueMessages = (input: Record<string, unknown>) => {
  const parsed = backendEnvSchema.safeParse(input);
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => issue.message);
};

describe('backend env schema profile validation', () => {
  it('parses development env with SECRETS_PROVIDER=env and explicit secrets', () => {
    const parsed = backendEnvSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'development',
      DEPLOYMENT_PROFILE: 'dev',
      SECRETS_PROVIDER: 'env',
      AUTH_JWT_SECRET: 'dev-secret-not-placeholder',
      SESSION_SECRET: 'dev-session-not-placeholder'
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects staging env with in-memory/document and env secrets provider', () => {
    const messages = issueMessages({
      ...baseEnv,
      NODE_ENV: 'staging',
      DEPLOYMENT_PROFILE: 'staging',
      SECRETS_PROVIDER: 'env',
      AUTH_JWT_SECRET: 'change-me-in-production',
      SESSION_SECRET: 'dev-session-secret-12345',
      MVP_PERSISTENCE_DRIVER: 'memory',
      DOCUMENTS_PERSISTENCE_DRIVER: 'memory',
      ALLOW_IN_MEMORY_STATE: true,
      INTEGRATION_WEBHOOK_SECRET: undefined
    });

    expect(messages).toContain(
      'SECRETS_PROVIDER=env is forbidden in production/staging/prod-profile; use vault or kms'
    );
    expect(messages).toContain(
      'AUTH_JWT_SECRET must not use development value in production/staging/prod-profile'
    );
    expect(messages).toContain(
      'SESSION_SECRET must not use development value in production/staging/prod-profile'
    );
    expect(messages).toContain(
      'MVP_PERSISTENCE_DRIVER must be postgres in production/staging/prod-profile'
    );
    expect(messages).toContain(
      'DOCUMENTS_PERSISTENCE_DRIVER must be postgres in production/staging/prod-profile'
    );
    expect(messages).toContain(
      'ALLOW_IN_MEMORY_STATE must be false in production/staging/prod-profile'
    );
    expect(messages).toContain(
      'INTEGRATION_WEBHOOK_SECRET is required in production/staging/prod-profile to authenticate integration webhooks'
    );
    expect(messages).toContain(
      'SCORM_CONTENT_TOKEN_SECRET must not use development value in production/staging/prod-profile'
    );
  });

  it('rejects production env without prod deployment profile', () => {
    const messages = issueMessages({
      ...strictValidEnv,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'staging'
    });

    expect(messages).toContain('NODE_ENV=production requires DEPLOYMENT_PROFILE=prod');
  });

  it('parses production env with DEPLOYMENT_PROFILE=prod and strict settings', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictValidEnv,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod'
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects DEPLOYMENT_PROFILE=prod with NODE_ENV=development and rotation > 30', () => {
    const messages = issueMessages({
      ...strictValidEnv,
      NODE_ENV: 'development',
      DEPLOYMENT_PROFILE: 'prod',
      SECRET_ROTATION_MAX_AGE_DAYS: 31
    });

    expect(messages).toContain('DEPLOYMENT_PROFILE=prod requires NODE_ENV=production');
    expect(messages).toContain('SECRET_ROTATION_MAX_AGE_DAYS must be <= 30 in prod');
  });
});

describe('RECERTIFICATION_SCAN_ENABLED / RECERTIFICATION_CRON_SCHEDULE', () => {
  const validDevEnv = {
    ...baseEnv,
    AUTH_JWT_SECRET: 'dev-secret-not-placeholder',
    SESSION_SECRET: 'dev-session-not-placeholder'
  } as const;

  it('defaults to disabled with the 03:00 daily schedule', () => {
    const env = backendEnvSchema.parse(validDevEnv);
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(false);
    expect(env.RECERTIFICATION_CRON_SCHEDULE).toBe('0 3 * * *');
  });

  it('never coerces the string "false" to true', () => {
    const env = backendEnvSchema.parse({ ...validDevEnv, RECERTIFICATION_SCAN_ENABLED: 'false' });
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(false);
  });

  it('enables on "true" and accepts a custom cron', () => {
    const env = backendEnvSchema.parse({
      ...validDevEnv,
      RECERTIFICATION_SCAN_ENABLED: 'true',
      RECERTIFICATION_CRON_SCHEDULE: '0 2 * * *'
    });
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(true);
    expect(env.RECERTIFICATION_CRON_SCHEDULE).toBe('0 2 * * *');
  });
});

describe('antivirus scan gate env', () => {
  const validDevEnv = {
    ...baseEnv,
    AUTH_JWT_SECRET: 'dev-secret-not-placeholder',
    SESSION_SECRET: 'dev-session-not-placeholder'
  } as const;

  it('defaults antivirus to disabled with clamd host/port', () => {
    const parsed = backendEnvSchema.parse(validDevEnv);
    expect(parsed.ANTIVIRUS_ENABLED).toBe(false);
    expect(parsed.CLAMAV_HOST).toBe('clamav');
    expect(parsed.CLAMAV_PORT).toBe(3310);
  });

  it('enables antivirus from the string "true" but never from "false"', () => {
    expect(
      backendEnvSchema.parse({ ...validDevEnv, ANTIVIRUS_ENABLED: 'true' }).ANTIVIRUS_ENABLED
    ).toBe(true);
    expect(
      backendEnvSchema.parse({ ...validDevEnv, ANTIVIRUS_ENABLED: 'false' }).ANTIVIRUS_ENABLED
    ).toBe(false);
  });
});
