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
    // E-signature seam (Phase 6, НЭП). Ships dormant (false) → NoopDocumentSignatureProvider.
    // Custom boolean parse — NOT z.coerce.boolean (which maps the string "false" → true),
    // same rule as ANTIVIRUS_ENABLED so a signing flag is never accidentally on.
    ESIGN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active signing provider. 'noop' until a КриптоПро adapter is wired (Phase 6 follow-up). */
    ESIGN_PROVIDER: z.enum(['noop', 'cryptopro', 'fake']).default('noop'),
    /** Human-readable signer (organisation) name stamped onto the document for display. */
    ESIGN_SIGNER_NAME: z.string().min(1).default('CDOProf'),
    // Export-signature seam (Phase 6, КЭП on registry export files). Ships dormant (false) →
    // NoopExportSignatureProvider. Separate from ESIGN_* (different cert/purpose: detached КЭП on
    // госреестр uploads vs embedded НЭП on learner documents). Custom boolean parse — NOT
    // z.coerce.boolean (string "false" → true) — so a signing flag is never accidentally on.
    EXPORT_SIGN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active export-signing provider. 'noop' until a КриптоПро adapter is wired. 'fake' = staging preview. */
    EXPORT_SIGN_PROVIDER: z.enum(['noop', 'cryptopro', 'fake']).default('noop'),
    /** Human-readable signer (organisation) name stamped onto the export signature for display. */
    EXPORT_SIGN_SIGNER_NAME: z.string().min(1).default('CDOProf'),
    // Payments seam (Phase 7). Ships dormant (false) → NoopPaymentProvider: online payment is
    // unavailable, manual bank-transfer mark-paid still works. Custom boolean parse — NOT
    // z.coerce.boolean (string "false" → true) — so a money flag is never accidentally on.
    PAYMENTS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active payment provider. 'noop' until a ЮKassa adapter is wired. 'fake' = staging preview. */
    PAYMENTS_PROVIDER: z.enum(['noop', 'yookassa', 'fake']).default('noop'),
    /** ISO-4217 currency. RUB-only this iteration. */
    PAYMENTS_CURRENCY: z.literal('RUB').default('RUB'),
    // ЕСИА (Госуслуги) OAuth/OIDC seam (Phase 4 follow-up). Ships dormant (false) →
    // NoopEsiaProvider. Custom boolean parse — NOT z.coerce.boolean (string "false" → true) —
    // same rule as ANTIVIRUS_ENABLED/ESIGN_ENABLED so a login flag is never accidentally on.
    ESIA_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active ЕСИА provider. 'noop' (off) | 'mock' (dev/tests) | 'esia' (real ОIDC, follow-up). */
    ESIA_PROVIDER: z.enum(['noop', 'mock', 'esia']).default('noop'),
    ESIA_CLIENT_ID: z.string().min(1).optional(),
    ESIA_SCOPES: z.string().min(1).default('openid fullname snils birthdate email'),
    ESIA_AUTHORIZE_URL: z.string().url().optional(),
    ESIA_TOKEN_URL: z.string().url().optional(),
    ESIA_USERINFO_URL: z.string().url().optional(),
    ESIA_CALLBACK_URL: z.string().url().optional(),
    ESIA_CERT_PATH: z.string().min(1).optional(),
    /** HMAC secret for the self-contained OAuth `state` token. Dev default; override in prod. */
    ESIA_STATE_SECRET: z.string().min(1).default('dev-esia-state-secret'),
    /** Where the browser lands after a callback (frontend origin). */
    ESIA_FRONTEND_REDIRECT_BASE: z.string().url().default('http://localhost:3000'),
    // Email notifications (Phase 5). Custom boolean parse — NOT z.coerce.boolean, which maps
    // the string "false" → true. NoopMailer is the safe default (no SMTP needed).
    NOTIFICATIONS_EMAIL_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    // Recertification/reminders daily scan (Phase 5B-2). Custom boolean parse — NOT
    // z.coerce.boolean (which maps the string "false" → true). Ships dormant (false);
    // ops enables it once SMTP + persistence are ready.
    RECERTIFICATION_SCAN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron expression for the nightly recertification + course-deadline scan (UTC — the cron is pinned to timeZone 'UTC'). */
    RECERTIFICATION_CRON_SCHEDULE: z.string().min(1).default('0 3 * * *'),
    // Identity image retention purge (Phase 4 Plan A). Ships dormant; ops enables after
    // confirming the 90-day policy. Custom boolean parse — NOT z.coerce.boolean.
    IDENTITY_IMAGE_RETENTION_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron for the nightly identity-image purge (UTC). */
    IDENTITY_RETENTION_CRON_SCHEDULE: z.string().default('0 4 * * *'),
    // Proctoring video retention purge (Phase 4 Plan B). Ships dormant; ops enables after the
    // owner confirms the 365-day policy (roadmap open question №6). Custom boolean parse.
    PROCTORING_VIDEO_RETENTION_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron for the nightly proctoring-video purge (UTC; offset from identity's 04:00). */
    PROCTORING_RETENTION_CRON_SCHEDULE: z.string().default('0 5 * * *'),
    // Phase 9 Plan A — SCORM package import (zip upload ceiling, bytes). Default 300 MB.
    SCORM_PACKAGE_MAX_BYTES: z.coerce.number().int().positive().default(314_572_800),
    /** HMAC secret for the path-embedded scorm-content tokens (iframe asset auth). */
    SCORM_CONTENT_TOKEN_SECRET: z.string().min(8).default('dev-scorm-content-secret'),
    /** TTL of a scorm-content token, seconds. Default 4h (player session). */
    SCORM_CONTENT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(14_400),
    // Web Push (Phase 10 Track C). Ships dormant (false); ops enables once VAPID keys are
    // generated. Custom boolean parse — NOT z.coerce.boolean (which maps "false" → true).
    WEB_PUSH_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** VAPID public key (base64url). Required when WEB_PUSH_ENABLED=true (see superRefine). */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    /** VAPID private key (base64url). Required when WEB_PUSH_ENABLED=true. */
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** VAPID subject — mailto: or https: contact for push services. */
    VAPID_SUBJECT: z.string().min(1).default('mailto:no-reply@cdoprof.local'),
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
    // Custom boolean parse — NOT z.coerce.boolean, which maps the string "false" → true
    // (Boolean("false") === true). Same pattern as ANTIVIRUS_ENABLED above.
    DB_MIGRATIONS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(true),
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
      'dev-session-secret-12345',
      'dev-scorm-content-secret',
      'dev-esia-state-secret'
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

    if (env.NOTIFICATIONS_EMAIL_ENABLED === true && !env.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when NOTIFICATIONS_EMAIL_ENABLED=true'
      });
    }

    if (env.WEB_PUSH_ENABLED === true && (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VAPID_PUBLIC_KEY'],
        message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required when WEB_PUSH_ENABLED=true'
      });
    }

    const smtpUserSet = Boolean(env.SMTP_USER);
    const smtpPasswordSet = Boolean(env.SMTP_PASSWORD);
    if (smtpUserSet !== smtpPasswordSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_PASSWORD'],
        message: 'SMTP_USER and SMTP_PASSWORD must both be set or both be omitted'
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

    if (devSecrets.includes(env.SCORM_CONTENT_TOKEN_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'SCORM_CONTENT_TOKEN_SECRET must not use development value in production/staging/prod-profile'
      });
    }

    if (devSecrets.includes(env.ESIA_STATE_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'ESIA_STATE_SECRET must not use development value in production/staging/prod-profile'
      });
    }

    // ESIGN_PROVIDER=fake is a STAGING preview signer (self-marked non-cryptographic).
    // Deliberately blocked ONLY in production, NOT staging: staging is where the owner
    // previews the signing pipeline end-to-end. Real prod is always NODE_ENV=production
    // (enforced by the DEPLOYMENT_PROFILE=prod ↔ NODE_ENV=production parity checks above),
    // so this cannot be dodged by a prod deployment.
    if (env.ESIGN_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ESIGN_PROVIDER'],
        message:
          'ESIGN_PROVIDER=fake is forbidden in production — it fakes signatures (use cryptopro)'
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

    // EXPORT_SIGN_PROVIDER=fake is a STAGING preview signer (self-marked non-cryptographic).
    // Deliberately blocked ONLY in production, NOT staging: staging is where the owner previews
    // the export-signing pipeline. Real prod is always NODE_ENV=production (enforced by the
    // DEPLOYMENT_PROFILE=prod ⟺ NODE_ENV=production parity checks above), so this cannot be dodged.
    if (env.EXPORT_SIGN_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EXPORT_SIGN_PROVIDER'],
        message:
          'EXPORT_SIGN_PROVIDER=fake is forbidden in production — it fakes signatures (use cryptopro)'
      });
    }

    // PAYMENTS_PROVIDER=fake is a STAGING preview mode (no real money moves).
    // Deliberately blocked ONLY in production, NOT staging: staging is where the owner previews
    // the payment pipeline end-to-end. Real prod is always NODE_ENV=production (enforced by the
    // DEPLOYMENT_PROFILE=prod ⟺ NODE_ENV=production parity checks above), so this cannot be dodged.
    if (env.PAYMENTS_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENTS_PROVIDER'],
        message:
          'PAYMENTS_PROVIDER=fake is forbidden in production — it fakes payments (use yookassa)'
      });
    }
  });

export type BackendEnv = z.infer<typeof backendEnvSchema>;

/** Alias for test imports that expect the name `envSchema`. */
export const envSchema = backendEnvSchema;
