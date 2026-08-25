import { z } from 'zod';

const frontendEnvSchema = z.object({
  /** Origin + префикс API (например http://localhost:3001/api/v1), как у Nest setGlobalPrefix(API_PREFIX) */
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_REALTIME_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_TENANT_ID: z.string().min(1).default('tenant_demo'),
  /**
   * ФТ-D3.2: базовый домен аренды (`lms.example.ru`). Пока пуст — поддоменов нет,
   * арендатор берётся из NEXT_PUBLIC_DEFAULT_TENANT_ID (прежнее поведение), поэтому
   * выкладка кода не ждёт DNS и wildcard-сертификата.
   */
  NEXT_PUBLIC_TENANT_BASE_DOMAIN: z.string().default(''),
  // ЕСИА (Госуслуги) OAuth seam. Ships dormant (false) — custom boolean parse, same rule as
  // backend ESIA_ENABLED: z.coerce.boolean would turn string "false" → true, which is unsafe for
  // a login flag.
  NEXT_PUBLIC_ESIA_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false)
});

const parsed = frontendEnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  NEXT_PUBLIC_DEFAULT_TENANT_ID: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? 'tenant_demo',
  NEXT_PUBLIC_TENANT_BASE_DOMAIN: process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? '',
  NEXT_PUBLIC_ESIA_ENABLED: process.env.NEXT_PUBLIC_ESIA_ENABLED
});

if (!parsed.success) {
  /*
   * Журнал 20: в свежей рабочей копии сборка падала на разборе переменных, и сообщение
   * состояло из машинного отчёта проверки — человек видел «invalid_type … undefined» и не
   * понимал, что делать. Причина всегда одна и та же: `apps/frontend/.env` не создан, а
   * корневой `.env` фронту не годится — Next читает переменные только из своей папки.
   *
   * Ошибка сборки — тоже сообщение человеку, и правило `TXT-004` действует и здесь:
   * сказать, что произошло и что сделать, а машинные подробности оставить ниже.
   */
  const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(
    'Не заданы переменные окружения фронтенда: ' +
      missing +
      '.\nСоздайте файл apps/frontend/.env — например: cp apps/frontend/.env.example apps/frontend/.env' +
      '\nКорневой .env фронтенду не подходит: Next.js читает переменные только из своей папки.' +
      '\nПодробности проверки: ' +
      JSON.stringify(parsed.error.issues)
  );
}

export const frontendEnv = parsed.data;

export type FrontendEnv = typeof frontendEnv;
