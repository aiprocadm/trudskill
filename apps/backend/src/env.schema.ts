import { z } from 'zod';

/** См. AggregateError [::1 vs 127.0.0.1]: Postgres/Redis из Docker часто слушает только IPv4, а Node разрешает `localhost` в ::1 первым. */
function localhostToIpv4LoopbackUrl(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname !== 'localhost') {
      return urlString;
    }
    parsed.hostname = '127.0.0.1';
    return parsed.toString();
  } catch {
    return urlString;
  }
}

const loopbackNormalizedUrlSchema = z.string().url().transform(localhostToIpv4LoopbackUrl);

const deploymentProfileSchema = z.enum(['dev', 'staging', 'prod']);
const secretsProviderSchema = z.enum(['env', 'vault', 'kms']);

export const backendEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    DEPLOYMENT_PROFILE: deploymentProfileSchema.default('dev'),
    RELEASE_VERSION: z.string().default('dev'),
    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    API_PREFIX: z.string().default('/api/v1'),
    DATABASE_URL: loopbackNormalizedUrlSchema,
    REDIS_URL: loopbackNormalizedUrlSchema,
    RABBITMQ_URL: loopbackNormalizedUrlSchema,
    S3_ENDPOINT: loopbackNormalizedUrlSchema,
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    // AV scan gate (V1.1). Custom boolean parse (NOT z.coerce.boolean, which maps the
    // string "false" → true) so a security flag is never accidentally enabled.
    ANTIVIRUS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    CLAMAV_HOST: z.string().min(1).default('clamav'),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
    // Email notifications (Phase 5). Custom boolean parse — NOT z.coerce.boolean, which maps
    // the string "false" → true. NoopMailer is the safe default (no SMTP needed).
    NOTIFICATIONS_EMAIL_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).default('no-reply@cdoprof.local'),
    SECRETS_PROVIDER: secretsProviderSchema.default('env'),
    AUTH_JWT_SECRET: z.string().min(10).optional(),
    SESSION_SECRET: z.string().min(10).optional(),
    AUTH_JWT_SECRET_KEY_REF: z.string().min(3).default('auth.jwt'),
    AUTH_JWT_SECRET_VERSION: z.string().min(1).default('latest'),
    SESSION_SECRET_KEY_REF: z.string().min(3).default('session.cookie'),
    SESSION_SECRET_VERSION: z.string().min(1).default('latest'),
    SECRET_ROTATION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
    VAULT_ADDR: z.string().url().optional(),
    VAULT_TOKEN: z.string().min(10).optional(),
    VAULT_MOUNT: z.string().min(1).default('secret'),
    KMS_ENDPOINT: z.string().url().optional(),
    KMS_KEY_RING: z.string().min(1).optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),
    DB_MIGRATIONS_ENABLED: z.coerce.boolean().default(true),
    DB_MIGRATIONS_DIR: z.string().default('migrations'),
    READINESS_QUEUE_BACKLOG_THRESHOLD: z.coerce.number().int().min(0).default(1_000),
    READINESS_QUEUE_LAG_SECONDS_THRESHOLD: z.coerce.number().int().min(0).default(300),
    READINESS_OUTBOX_BACKLOG_THRESHOLD: z.coerce.number().int().min(0).default(500),
    CORS_ORIGIN: z.string().url(),
    PUBLIC_BASE_URL: z.string().url(),
    REALTIME_PUBLIC_URL: z.string().url(),
    /** Должен совпадать с REALTIME_PUBLISH_KEY у сервиса realtime (заголовок x-realtime-key). */
    REALTIME_PUBLISH_KEY: z.string().min(10),
    ALLOW_IN_MEMORY_STATE: z.coerce.boolean().default(false),
    /** `memory` — in-process arrays; `postgres` — learning.mvp_runtime_documents (JSON per entity). */
    MVP_PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    /** `memory` — снимок в процессе на запрос; `postgres` — documents.runtime_documents + JSON по сущности. */
    DOCUMENTS_PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    LMS_READ_MODEL: z.enum(['legacy', 'normalized', 'shadow']).default('legacy'),
    DOCUMENTS_READ_MODEL: z.enum(['legacy', 'normalized', 'shadow']).default('legacy'),
    LMS_DUAL_WRITE_ENABLED: z.coerce.boolean().default(false),
    DOCUMENTS_DUAL_WRITE_ENABLED: z.coerce.boolean().default(false),
    INTEGRATION_WEBHOOK_SECRET: z.string().min(10).optional(),
    OUTBOX_PUBLISHER_ENABLED: z.coerce.boolean().default(true),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
    OUTBOX_MAX_RETRIES: z.coerce.number().int().nonnegative().default(10),
    AUTH_PROVIDER: z.enum(['legacy', 'supertokens']).default('legacy'),
    SUPERTOKENS_CORE_URI: z
      .string()
      .url()
      .default('http://localhost:3567')
      .transform(localhostToIpv4LoopbackUrl),
    SUPERTOKENS_API_KEY: z.string().min(8).optional(),
    SUPERTOKENS_APP_NAME: z.string().min(1).default('cdoprof'),
    SUPERTOKENS_API_DOMAIN: z.string().url().optional(),
    SUPERTOKENS_WEBSITE_DOMAIN: z.string().url().optional(),
    /** Общий секрет worker → backend для `POST .../internal/worker/*` (очередь массовых назначений). */
    WORKER_CALLBACK_SECRET: z.string().min(8).optional(),
    /** Exchange RabbitMQ для фоновых job (совпадает с `WORKER_EXCHANGE` в apps/worker). */
    JOB_EXCHANGE: z.string().min(1).default('jobs.topic'),
    /** Routing key публикации задачи массового зачисления. */
    JOB_ROUTING_BULK_ENROLLMENT: z.string().min(1).default('lms.bulk_enrollment')
  })
  .superRefine((env, ctx) => {
    const devSecrets = [
      'change-me-in-production',
      'dev-jwt-secret-12345',
      'dev-session-secret-12345'
    ];
    const isStrictProfile =
      env.NODE_ENV === 'production' ||
      env.NODE_ENV === 'staging' ||
      env.DEPLOYMENT_PROFILE === 'prod';

    if (env.DEPLOYMENT_PROFILE === 'prod' && env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DEPLOYMENT_PROFILE=prod requires NODE_ENV=production'
      });
    }

    if (env.DEPLOYMENT_PROFILE !== 'prod' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NODE_ENV=production requires DEPLOYMENT_PROFILE=prod'
      });
    }

    if (env.SECRETS_PROVIDER === 'env') {
      if (!env.AUTH_JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH_JWT_SECRET is required when SECRETS_PROVIDER=env'
        });
      }
      if (!env.SESSION_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SESSION_SECRET is required when SECRETS_PROVIDER=env'
        });
      }
    }

    if (env.SECRETS_PROVIDER === 'vault' && (!env.VAULT_ADDR || !env.VAULT_TOKEN)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'VAULT_ADDR and VAULT_TOKEN are required when SECRETS_PROVIDER=vault'
      });
    }

    if (env.SECRETS_PROVIDER === 'kms' && (!env.KMS_ENDPOINT || !env.KMS_KEY_RING)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'KMS_ENDPOINT and KMS_KEY_RING are required when SECRETS_PROVIDER=kms'
      });
    }

    if (!isStrictProfile) {
      return;
    }

    if (env.SECRETS_PROVIDER === 'env') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'SECRETS_PROVIDER=env is forbidden in production/staging/prod-profile; use vault or kms'
      });
    }

    if (env.AUTH_JWT_SECRET && devSecrets.includes(env.AUTH_JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AUTH_JWT_SECRET must not use development value in production/staging/prod-profile'
      });
    }

    if (env.SESSION_SECRET && devSecrets.includes(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SESSION_SECRET must not use development value in production/staging/prod-profile'
      });
    }

    if (env.ALLOW_IN_MEMORY_STATE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ALLOW_IN_MEMORY_STATE must be false in production/staging/prod-profile'
      });
    }

    if (env.MVP_PERSISTENCE_DRIVER !== 'postgres') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MVP_PERSISTENCE_DRIVER must be postgres in production/staging/prod-profile'
      });
    }

    if (env.DOCUMENTS_PERSISTENCE_DRIVER !== 'postgres') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DOCUMENTS_PERSISTENCE_DRIVER must be postgres in production/staging/prod-profile'
      });
    }

    if (!env.INTEGRATION_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'INTEGRATION_WEBHOOK_SECRET is required in production/staging/prod-profile to authenticate integration webhooks'
      });
    }

    if (env.DEPLOYMENT_PROFILE === 'prod' && env.SECRET_ROTATION_MAX_AGE_DAYS > 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SECRET_ROTATION_MAX_AGE_DAYS must be <= 30 in prod'
      });
    }
  });

export type BackendEnv = z.infer<typeof backendEnvSchema>;
