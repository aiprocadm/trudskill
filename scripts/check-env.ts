import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

const rootEnvPath = resolve(process.cwd(), '.env');

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RELEASE_VERSION: z.string().default('dev-local'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    RABBITMQ_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    AUTH_JWT_SECRET: z.string().min(10),
    SESSION_SECRET: z.string().min(10),
    CORS_ORIGIN: z.string().url(),
    PUBLIC_BASE_URL: z.string().url(),
    FRONTEND_PORT: z.coerce.number().int().positive().default(3000),
    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    REALTIME_PORT: z.coerce.number().int().positive().default(3002),
    BACKEND_PUBLIC_URL: z.string().url(),
    REALTIME_PUBLIC_URL: z.string().url(),
    WORKER_INTERNAL_URL: z.string().url(),
    NEXT_PUBLIC_API_BASE_URL: z.string().url(),
    NEXT_PUBLIC_REALTIME_URL: z.string().url(),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    REALTIME_PUBLISH_KEY: z.string().min(10),
    INTEGRATION_WEBHOOK_SECRET: z.string().min(10).optional()
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.INTEGRATION_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INTEGRATION_WEBHOOK_SECRET is required in production',
        path: ['INTEGRATION_WEBHOOK_SECRET']
      });
    }

    // Reject obvious dev/placeholder values that pass length checks but are insecure.
    const DEV_DEFAULT_MARKERS = [
      'change-me',
      'dev-webhook-secret',
      'minio123',
      'postgres:postgres',
      'guest:guest',
      'supertokens-api-key'
    ];
    const SECRET_FIELDS = [
      'AUTH_JWT_SECRET',
      'SESSION_SECRET',
      'REALTIME_PUBLISH_KEY',
      'INTEGRATION_WEBHOOK_SECRET',
      'DATABASE_URL',
      'RABBITMQ_URL',
      'S3_SECRET_KEY'
    ] as const;

    for (const field of SECRET_FIELDS) {
      const value = String((env as Record<string, unknown>)[field] ?? '').toLowerCase();
      if (value && DEV_DEFAULT_MARKERS.some((marker) => value.includes(marker))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} looks like a dev default — set a real secret in production`,
          path: [field]
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

console.log('✅ Environment variables are valid');
