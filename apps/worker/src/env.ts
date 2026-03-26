import { z } from 'zod';

const workerEnvSchema = z.object({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  DOCUMENT_GENERATION_QUEUE: z.string().default('documents.generation'),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_INTERNAL_URL: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  DOCUMENTS_STORAGE_BUCKET: z.string().default('cdoprof-dev')
});

export const workerEnv = workerEnvSchema.parse(process.env);
