import { z } from 'zod';

const workerEnvSchema = z.object({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url()
});

export const workerEnv = workerEnvSchema.parse(process.env);
