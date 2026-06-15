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
});
