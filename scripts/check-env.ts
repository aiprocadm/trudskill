import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

const rootEnvPath = resolve(process.cwd(), '.env');

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5)
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

console.log('✅ Environment variables are valid');
