import { z } from 'zod';

export const backendEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RELEASE_VERSION: z.string().default('dev'),
    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    API_PREFIX: z.string().default('/api/v1'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    RABBITMQ_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    AUTH_JWT_SECRET: z.string().min(10),
    SESSION_SECRET: z.string().min(10),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),
    DB_MIGRATIONS_ENABLED: z.coerce.boolean().default(true),
    DB_MIGRATIONS_DIR: z.string().default('migrations'),
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
    OUTBOX_MAX_RETRIES: z.coerce.number().int().nonnegative().default(10)
  })
  .superRefine((env, ctx) => {
    const devSecrets = [
      'change-me-in-production',
      'dev-jwt-secret-12345',
      'dev-session-secret-12345'
    ];
    if (env.NODE_ENV === 'production' && devSecrets.includes(env.AUTH_JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AUTH_JWT_SECRET must not use development value in production'
      });
    }
    if (env.NODE_ENV === 'production' && devSecrets.includes(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SESSION_SECRET must not use development value in production'
      });
    }
    if (env.NODE_ENV === 'production' && env.ALLOW_IN_MEMORY_STATE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ALLOW_IN_MEMORY_STATE must be false in production'
      });
    }
    if (env.NODE_ENV === 'production' && env.MVP_PERSISTENCE_DRIVER !== 'postgres') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MVP_PERSISTENCE_DRIVER must be postgres in production'
      });
    }
    if (env.NODE_ENV === 'production' && env.DOCUMENTS_PERSISTENCE_DRIVER !== 'postgres') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DOCUMENTS_PERSISTENCE_DRIVER must be postgres in production'
      });
    }
    if (env.NODE_ENV === 'production' && !env.INTEGRATION_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'INTEGRATION_WEBHOOK_SECRET is required in production to authenticate integration webhooks'
      });
    }
  });

export type BackendEnv = z.infer<typeof backendEnvSchema>;
