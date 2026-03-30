import { z } from 'zod';

const realtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RELEASE_VERSION: z.string().default('dev'),
  REALTIME_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  REALTIME_PUBLISH_KEY: z.string().min(10)
});

export const realtimeEnv = realtimeEnvSchema.parse(process.env);
