import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const envCandidates = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '.env'),
  join(process.cwd(), '..', '..', '.env')
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const realtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RELEASE_VERSION: z.string().default('dev'),
  REALTIME_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  REALTIME_PUBLISH_KEY: z.string().min(10),
  /** Тот же секрет, что `AUTH_JWT_SECRET` у backend (проверка access token в SSE). */
  AUTH_JWT_SECRET: z.string().min(10),
  REALTIME_STREAM_MAXLEN: z.coerce.number().int().positive().default(5000),
  REALTIME_STREAM_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24),
  REALTIME_STREAM_READ_BATCH: z.coerce.number().int().positive().default(200),
  REALTIME_DIAGNOSTICS_MAX_ITEMS: z.coerce.number().int().positive().default(1000),
  REALTIME_DIAGNOSTICS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7)
});

export const realtimeEnv = realtimeEnvSchema.parse(process.env);
