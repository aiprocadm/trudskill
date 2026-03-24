import { z } from 'zod';

const realtimeEnvSchema = z.object({
  REALTIME_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().url()
});

export const realtimeEnv = realtimeEnvSchema.parse(process.env);
