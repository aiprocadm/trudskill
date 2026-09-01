import { afterEach, describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

/**
 * Класс «валидация требует не то, что читает код» (журнал 316).
 *
 * `SecretsService` при `SECRETS_PROVIDER=vault` читает `VAULT_SECRET_AUTH_JWT` и
 * `VAULT_SECRET_SESSION_COOKIE` (`MirroredRemoteSecretProvider`, префикс `VAULT_SECRET`).
 * Ни адрес хранилища, ни токен доступа он не открывает НИ РАЗУ — секреты уже зеркалированы
 * в окружение внешним средством.
 *
 * Прежняя проверка требовала ровно наоборот: `VAULT_ADDR` и `VAULT_TOKEN` (то есть просила
 * положить в окружение боевой токен Vault, дающий доступ ко всем секретам организации, —
 * ради проверки, которая ничего не проверяет) и НЕ требовала переменных, без которых
 * приложение падает. Итог: старт зелёный, а первый же вход пользователя — «Secret is not
 * configured». Это нарушение принципа «падать сразу», которому следуют остальные гейты.
 */
const baseEnv = {
  RELEASE_VERSION: '1.0.0',
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
  REALTIME_PUBLISH_KEY: 'realtime-publish-key'
} as const;

const messagesOf = (result: ReturnType<typeof backendEnvSchema.safeParse>): string =>
  result.success ? '' : result.error.issues.map((issue) => issue.message).join(' | ');

/**
 * Зеркалированные секреты живут в `process.env`, а не в разбираемом объекте: номер версии
 * открыт (`_V1`, `_V2026_08`), такие ключи в схему не впишешь. Проверка смотрит ровно туда же,
 * куда смотрит `MirroredRemoteSecretProvider`, — иначе она проверяла бы не то место.
 */
const mirrored: string[] = [];
const setMirrored = (key: string, value: string): void => {
  process.env[key] = value;
  mirrored.push(key);
};

afterEach(() => {
  for (const key of mirrored.splice(0)) delete process.env[key];
});

describe('SECRETS_PROVIDER требует то, что читает SecretsService', () => {
  it('vault без зеркалированных секретов отвергается ПРИ СТАРТЕ, а не при первом входе', () => {
    const result = backendEnvSchema.safeParse({ ...baseEnv, SECRETS_PROVIDER: 'vault' });

    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('VAULT_SECRET_AUTH_JWT');
    expect(messagesOf(result)).toContain('VAULT_SECRET_SESSION_COOKIE');
  });

  it('vault с зеркалированными секретами проходит без адреса и токена хранилища', () => {
    setMirrored('VAULT_SECRET_AUTH_JWT_V1', 'mirrored-jwt-secret-value');
    setMirrored('VAULT_SECRET_SESSION_COOKIE_V1', 'mirrored-session-secret-value');

    const result = backendEnvSchema.safeParse({ ...baseEnv, SECRETS_PROVIDER: 'vault' });

    expect(messagesOf(result)).toBe('');
    expect(result.success).toBe(true);
  });

  it('kms проверяется тем же правилом со своим префиксом', () => {
    const missing = backendEnvSchema.safeParse({ ...baseEnv, SECRETS_PROVIDER: 'kms' });
    expect(messagesOf(missing)).toContain('KMS_SECRET_AUTH_JWT');

    setMirrored('KMS_SECRET_AUTH_JWT_V1', 'mirrored-jwt-secret-value');
    setMirrored('KMS_SECRET_SESSION_COOKIE_V1', 'mirrored-session-secret-value');

    const complete = backendEnvSchema.safeParse({ ...baseEnv, SECRETS_PROVIDER: 'kms' });
    expect(messagesOf(complete)).toBe('');
    expect(complete.success).toBe(true);
  });

  it('живой токен хранилища больше не требуется: схема о нём не знает', () => {
    // Требовать боевой токен ради ничего — расширение поверхности атаки без выгоды.
    setMirrored('VAULT_SECRET_AUTH_JWT_V1', 'mirrored-jwt-secret-value');
    setMirrored('VAULT_SECRET_SESSION_COOKIE_V1', 'mirrored-session-secret-value');

    const result = backendEnvSchema.safeParse({ ...baseEnv, SECRETS_PROVIDER: 'vault' });
    expect(result.success).toBe(true);

    // Ключей хранилища в разобранном окружении больше нет: их никто не читает,
    // а слот под боевой токен — это приглашение положить его туда без нужды.
    const parsed = result.success ? (result.data as Record<string, unknown>) : {};
    expect(Object.keys(parsed)).not.toContain('VAULT_TOKEN');
    expect(Object.keys(parsed)).not.toContain('VAULT_ADDR');
    expect(Object.keys(parsed)).not.toContain('KMS_ENDPOINT');
  });
});
