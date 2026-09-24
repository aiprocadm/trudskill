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
    // Строка не разбирается как адрес — отдаём как есть: проверять её будет zod, а не этот помощник.
    return urlString;
  }
}

const loopbackNormalizedUrlSchema = z.string().url().transform(localhostToIpv4LoopbackUrl);

/**
 * Разбор булевых переменных окружения.
 *
 * `z.coerce.boolean()` использовать НЕЛЬЗЯ: он приводит по правилам JS, где любая непустая
 * строка истинна, поэтому `FLAG=false` превращается в `true` — настройка делает ровно обратное
 * тому, что написано. В файле это уже знали (см. ANTIVIRUS_ENABLED), но четыре флага оставались
 * на `coerce` до 2026-08-12. Здесь тот же разбор одним общим местом, чтобы не расходилось дальше.
 */
const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

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
    // Gotenberg (ФТ-A1.3) — конвертация DOCX→PDF (LibreOffice внутри контейнера).
    // Инфраструктура готовится в Фазе 0; сам движок рендера подключается в Фазе 1 (ЭПИК A).
    GOTENBERG_URL: z.string().url().default('http://gotenberg:3000'),
    // Видеосервис (ФТ-B1.2, Фаза 2 Task 10). Решение владельца по вопросу №1 от 2026-07-28:
    // «берём готовый видеосервис». Секреты — ТОЛЬКО здесь; в БД (learning.video_provider_settings)
    // лежит несекретная конфигурация. Пусто = адаптер спит и резолвер отдаёт noop.
    KINESCOPE_API_URL: z.string().url().default('https://api.kinescope.io/v1'),
    KINESCOPE_API_TOKEN: z.string().optional(),
    // Общий секрет для проверки подписи вебхука. НЕ задан → вебхуки не принимаются вовсе:
    // принимать неподписанные события значит позволить кому угодно объявить видео готовым.
    KINESCOPE_WEBHOOK_SECRET: z.string().optional(),
    // E-signature seam (Phase 6, НЭП). Ships dormant (false) → NoopDocumentSignatureProvider.
    // Custom boolean parse — NOT z.coerce.boolean (which maps the string "false" → true),
    // same rule as ANTIVIRUS_ENABLED so a signing flag is never accidentally on.
    ESIGN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active signing provider. 'noop' until a КриптоПро adapter is wired (Phase 6 follow-up). */
    /**
     * Токен для чтения `/metrics` (Фаза 6 Task 5).
     *
     * Метрики — это карта нагрузки: по ним видно, какие центры активны, когда идут
     * экзамены и где тонко. Наружу их отдавать некому. Пусто в разработке — читаются
     * свободно; в production пустое значение запрещено (см. superRefine ниже), чтобы
     * «забыли задать» не превращалось в «открыто всем».
     */
    METRICS_TOKEN: z.string().min(16).optional(),
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
    /** ISO-4217 currency. RUB-only this iteration. */
    PAYMENTS_CURRENCY: z.literal('RUB').default('RUB'),
    // --- Acquirer credentials (one platform merchant). All optional; an adapter with blank
    // creds is omitted from the registry at runtime (boot never fails for a missing acquirer). ---
    YOOKASSA_SHOP_ID: z.string().default(''),
    YOOKASSA_SECRET_KEY: z.string().default(''),
    YOOKASSA_RETURN_URL: z.string().default(''),
    /*
     * ФТ-D5.2 — автоплатёж за АРЕНДУ. Отдельный магазин, а не магазин учебного центра:
     * здесь центр платит платформе, и деньги идут на счёт платформы. Пусто — адаптер не
     * подключается, и аренда остаётся на «счёт+акт» (`manual`).
     */
    /*
     * ФТ-F3 — Telegram-бот. Пусто — канал спит: ни уведомлений, ни ответов на команды.
     * Секрет ручки вебхука отдельный: по нему Telegram доказывает, что запрос от него.
     */
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
    TELEGRAM_BOT_USERNAME: z.string().default(''),
    RENTAL_YOOKASSA_SHOP_ID: z.string().default(''),
    RENTAL_YOOKASSA_SECRET_KEY: z.string().default(''),
    RENTAL_YOOKASSA_RETURN_URL: z.string().default(''),
    YOOKASSA_API_BASE: z.string().default('https://api.yookassa.ru/v3'),
    YOOKASSA_WEBHOOK_IPS: z
      .string()
      .default(
        '185.71.76.0/27,185.71.77.0/27,77.75.153.0/25,77.75.156.11,77.75.156.35,77.75.154.128/25,2a02:5180::/32'
      ),
    YOOKASSA_WEBHOOK_IP_CHECK: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(true),
    TINKOFF_TERMINAL_KEY: z.string().default(''),
    TINKOFF_PASSWORD: z.string().default(''),
    TINKOFF_API_BASE: z.string().default('https://securepay.tinkoff.ru'),
    TINKOFF_SUCCESS_URL: z.string().default(''),
    CLOUDPAYMENTS_PUBLIC_ID: z.string().default(''),
    CLOUDPAYMENTS_API_SECRET: z.string().default(''),
    CLOUDPAYMENTS_API_BASE: z.string().default('https://api.cloudpayments.ru'),
    ROBOKASSA_MERCHANT_LOGIN: z.string().default(''),
    ROBOKASSA_PASSWORD_1: z.string().default(''),
    ROBOKASSA_PASSWORD_2: z.string().default(''),
    ROBOKASSA_PAY_URL: z.string().default('https://auth.robokassa.ru/Merchant/Index.aspx'),
    // Phase 8 webinars seam master switch. Ships dormant (false → every tenant resolves to
    // NoopWebinarProvider regardless of their saved provider_code). Custom boolean parse — NOT
    // z.coerce.boolean (string "false" → true) — so the subsystem is never accidentally on.
    WEBINARS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
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
    /*
     * ТЗ 11.2 п.4: адрес-приёмник писем на нерабочем окружении.
     *
     * Стенд работает на копии данных с настоящими адресами слушателей. Вне production письмо
     * НЕ уходит по своему адресу никогда: либо всё перенаправляется сюда, либо не отправляется
     * вовсе. Пустое значение — безопасное умолчание «не отправлять».
     */
    MAIL_REDIRECT_TO: z.string().email().optional(),
    // Recertification/reminders daily scan (Phase 5B-2). Custom boolean parse — NOT
    // z.coerce.boolean (which maps the string "false" → true). Ships dormant (false);
    // ops enables it once SMTP + persistence are ready.
    RECERTIFICATION_SCAN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron expression for the nightly recertification + course-deadline scan (UTC — the cron is pinned to timeZone 'UTC'). */
    RECERTIFICATION_CRON_SCHEDULE: z.string().min(1).default('0 3 * * *'),
    // Автопереходы статусов групп (ТЗ перехода с CDOPROF, МГ-B3.1; Фаза 2, срез 8.2). Выключено
    // по умолчанию; расписание — до ночного обхода напоминаний (03:00), чтобы те видели новые статусы.
    GROUP_STATUS_SCAN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron ежедневного сканера статусов групп (UTC). */
    GROUP_STATUS_CRON_SCHEDULE: z.string().min(1).default('0 2 * * *'),
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
    VAPID_SUBJECT: z.string().min(1).default('mailto:no-reply@trudskill.local'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).default('no-reply@trudskill.local'),
    // `vault`/`kms` НЕ ходят во внешнее хранилище: значения зеркалируются в окружение
    // под префиксом (`VAULT_SECRET_AUTH_JWT_V1` и т.п.) чем-то внешним — агентом Vault,
    // init-контейнером. Поэтому адреса и токена хранилища здесь нет: приложение их не читает,
    // а требовать живой токен ради ничего — расширять поверхность атаки (журнал 316).
    SECRETS_PROVIDER: secretsProviderSchema.default('env'),
    AUTH_JWT_SECRET: z.string().min(10).optional(),
    SESSION_SECRET: z.string().min(10).optional(),
    AUTH_JWT_SECRET_KEY_REF: z.string().min(3).default('auth.jwt'),
    AUTH_JWT_SECRET_VERSION: z.string().min(1).default('latest'),
    SESSION_SECRET_KEY_REF: z.string().min(3).default('session.cookie'),
    SESSION_SECRET_VERSION: z.string().min(1).default('latest'),
    SECRET_ROTATION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
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
    /*
     * Пул соединений к базе (ТЗ «Стабилизация, UX и развитие», 1.2, гипотеза «б» — исчерпание
     * пула). Числа стояли ЗАШИТЫМИ в `database.service.ts`: поднять потолок на стенде было
     * нельзя иначе как правкой кода и выкаткой. Правило ТЗ: срок, порог и лимит — настройка
     * со значением по умолчанию.
     *
     * Умолчания оставлены прежними, чтобы поведение не изменилось само по себе: смысл правки
     * в том, чтобы РУЧКА ПОЯВИЛАСЬ, а не в том, чтобы что-то подкрутить вслепую.
     */
    /** Куда писать причину падения процесса (ТЗ 1.2): системный журнал владельцу недоступен. */
    CRASH_LOG_FILE: z.string().default('logs/crash.log'),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    READINESS_QUEUE_BACKLOG_THRESHOLD: z.coerce.number().int().min(0).default(1_000),
    READINESS_QUEUE_LAG_SECONDS_THRESHOLD: z.coerce.number().int().min(0).default(300),
    READINESS_OUTBOX_BACKLOG_THRESHOLD: z.coerce.number().int().min(0).default(500),
    CORS_ORIGIN: z.string().url(),
    PUBLIC_BASE_URL: z.string().url(),
    REALTIME_PUBLIC_URL: z.string().url(),
    /** Должен совпадать с REALTIME_PUBLISH_KEY у сервиса realtime (заголовок x-realtime-key). */
    REALTIME_PUBLISH_KEY: z.string().min(10),
    // Тот же разбор, что у ANTIVIRUS_ENABLED: z.coerce.boolean() отображает строку "false" → true,
    // то есть ALLOW_IN_MEMORY_STATE=false ВКЛЮЧАЛ хранение в памяти. В проде это ловилось запретом
    // ниже (приложение просто не стартовало), вне прода — молча теряло данные между запусками.
    ALLOW_IN_MEMORY_STATE: booleanFromEnv.default(false),
    /** `memory` — in-process arrays; `postgres` — learning.mvp_runtime_documents (JSON per entity). */
    MVP_PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    /** `memory` — снимок в процессе на запрос; `postgres` — documents.runtime_documents + JSON по сущности. */
    DOCUMENTS_PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    LMS_READ_MODEL: z.enum(['legacy', 'normalized', 'shadow']).default('legacy'),
    DOCUMENTS_READ_MODEL: z.enum(['legacy', 'normalized', 'shadow']).default('legacy'),
    LMS_DUAL_WRITE_ENABLED: booleanFromEnv.default(false),
    /**
     * Фаза 1 ТЗ перехода с CDOPROF (РМ32): какие коллекции домена читать из нормализованных
     * таблиц, через запятую (`groups,counterparties`). Пусто — всё из снимка (точка отката).
     * Разбор и проверка имён — modules/mvp/infrastructure/normalized-collections.ts.
     */
    LMS_NORMALIZED_COLLECTIONS: z.string().default(''),
    DOCUMENTS_DUAL_WRITE_ENABLED: booleanFromEnv.default(false),
    INTEGRATION_WEBHOOK_SECRET: z.string().min(10).optional(),
    OUTBOX_PUBLISHER_ENABLED: booleanFromEnv.default(true),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
    OUTBOX_MAX_RETRIES: z.coerce.number().int().nonnegative().default(10),
    /** Общий секрет worker → backend для `POST .../internal/worker/*` (очередь массовых назначений). */
    WORKER_CALLBACK_SECRET: z.string().min(8).optional(),
    /** Exchange RabbitMQ для фоновых job (совпадает с `WORKER_EXCHANGE` в apps/worker). */
    JOB_EXCHANGE: z.string().min(1).default('jobs.topic'),
    /** Routing key публикации задачи массового зачисления. */
    JOB_ROUTING_BULK_ENROLLMENT: z.string().min(1).default('lms.bulk_enrollment'),
    JOB_ROUTING_DOCUMENT: z.string().min(1).default('lms.document_generation'),
    /**
     * Фаза 6 Task 7: задача, висящая в `running` дольше этого срока, считается зависшей
     * (воркер умер с сообщением в руках) и возвращается в очередь. Пятнадцать минут —
     * это заведомо дольше любого честного выпуска документа вместе с конвертацией в PDF.
     */
    DOCUMENT_TASK_STUCK_MINUTES: z.coerce.number().int().positive().default(15),
    /** ТЗ перехода с CDOPROF §4: свой комментарий к задаче можно удалить в течение окна. */
    TASKS_COMMENT_DELETE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    /**
     * Сроки хранения (Фаза 6 Task 9). Таблицы росли без всякой чистки.
     *
     * `PROCESSED_MESSAGE_RETENTION_DAYS` — самый чувствительный: это отметки «сообщение
     * уже обработано». Срок заведомо больше любого окна повторов (десять попыток с
     * задержкой до пяти минут), иначе старое сообщение обработается повторно и выпустится
     * второе удостоверение.
     *
     * `AUDIT_RETENTION_DAYS` = 0 означает «хранить вечно» и является значением по
     * умолчанию: срок хранения журнала аудита — решение владельца, а не разработчика.
     */
    SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    MAGIC_LINK_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
    PROCESSED_MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().nonnegative().default(0),
    RETENTION_SWEEP_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' : v))
      .default(true),
    DOCUMENT_TASK_REAPER_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' : v))
      .default(true)
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

    // Требуем ИМЕННО то, что читает `SecretsService`: провайдеры `vault`/`kms` —
    // это `MirroredRemoteSecretProvider`, он берёт уже зеркалированные в окружение значения
    // по префиксу (`VAULT_SECRET_*` / `KMS_SECRET_*`) и никуда не ходит. Прежняя проверка
    // требовала `VAULT_ADDR`/`VAULT_TOKEN` — то есть боевой токен хранилища ради ничего —
    // и НЕ требовала переменных, без которых приложение падает на первом же входе
    // пользователя вместо отказа при старте (журнал 316).
    if (env.SECRETS_PROVIDER === 'vault' || env.SECRETS_PROVIDER === 'kms') {
      const prefix = env.SECRETS_PROVIDER === 'vault' ? 'VAULT_SECRET' : 'KMS_SECRET';
      const mirrored: ReadonlyArray<{ keyRef: string; version: string }> = [
        {
          keyRef: env.AUTH_JWT_SECRET_KEY_REF ?? 'auth.jwt',
          version: env.AUTH_JWT_SECRET_VERSION ?? 'latest'
        },
        {
          keyRef: env.SESSION_SECRET_KEY_REF ?? 'session.cookie',
          version: env.SESSION_SECRET_VERSION ?? 'latest'
        }
      ];

      for (const { keyRef, version } of mirrored) {
        const normalized = keyRef.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const base = `${prefix}_${normalized}`;
        // `latest` разрешает любую версию: `..._V1`, `..._V2026_08` — провайдер берёт старшую.
        const present =
          version === 'latest'
            ? Object.entries(process.env).some(
                ([key, value]) => Boolean(value) && key.startsWith(`${base}_V`)
              )
            : Boolean(process.env[`${base}_V${version}`]);

        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              version === 'latest'
                ? `${base}_V<version> is required when SECRETS_PROVIDER=${env.SECRETS_PROVIDER} (mirrored secret for ${keyRef})`
                : `${base}_V${version} is required when SECRETS_PROVIDER=${env.SECRETS_PROVIDER} (mirrored secret for ${keyRef})`
          });
        }
      }
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

    // NB: SECRETS_PROVIDER=env IS permitted in strict profiles. The 'vault'/'kms' providers
    // (MirroredRemoteSecretProvider) read from the same env vars with a versioned prefix — there
    // is no external secret manager in the single-VPS deploy model (managed services deferred by
    // the owner), so forbidding 'env' added friction without real isolation. The dev-default /
    // weak-secret guards below still apply to every provider, so prod secrets must still be strong.

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

    // Фаза 6 Task 5: метрики в production закрыты токеном. Отказ на старте, а не тихая
    // отдача всем желающим: незаданный токен — это не «настройка по умолчанию», а
    // открытая наружу карта нагрузки центра.
    if (!env.METRICS_TOKEN && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required in production — /metrics must not be public'
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

    /*
     * ESIA_PROVIDER='mock' в проде — ДЫРА В АУТЕНТИФИКАЦИИ (Фаза 6 Task 11).
     *
     * Мок-провайдер не проверяет ничего: он выдаёт вход по любому переданному СНИЛС. В
     * production это значит, что войти можно под ЛЮБЫМ зачисленным слушателем, зная только
     * его СНИЛС — а СНИЛС есть в приказах и договорах. Закрываем так же, как поддельного
     * подписанта выгрузок: старт прода с таким значением невозможен.
     *
     * Именно в production, а не в staging: staging — это место, где владелец смотрит
     * контур ЕСИА до подключения боевого.
     */
    if (env.ESIA_PROVIDER === 'mock' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ESIA_PROVIDER'],
        message:
          'ESIA_PROVIDER=mock is forbidden in production — it authenticates anyone by SNILS (use esia or noop)'
      });
    }
  });

export type BackendEnv = z.infer<typeof backendEnvSchema>;

/** Alias for test imports that expect the name `envSchema`. */
export const envSchema = backendEnvSchema;
