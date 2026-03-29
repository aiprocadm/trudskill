import { z } from 'zod';

const realtimeEnvSchema = z.object({
  REALTIME_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().url().default('http://localhost:6379'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  BACKEND_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  REALTIME_PUBLISH_KEY: z.string().default('dev-realtime-key')
});

export const realtimeEnv = realtimeEnvSchema.parse(process.env);
