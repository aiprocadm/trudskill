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

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RELEASE_VERSION: z.string().default('dev'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_PREFETCH: z.coerce.number().int().positive().default(20),
  WORKER_MAX_RETRIES: z.coerce.number().int().nonnegative().default(10),
  WORKER_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1_000),
  WORKER_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(300_000),
  WORKER_CONSUMER_NAME: z.string().default('worker.document-integration-notification'),
  DOCUMENT_GENERATION_QUEUE: z.string().default('documents.generation'),
  WORKER_EXCHANGE: z.string().default('jobs.topic'),
  WORKER_RETRY_EXCHANGE: z.string().default('jobs.retry.topic'),
  WORKER_DLX_EXCHANGE: z.string().default('jobs.dlx.topic'),
  WORKER_DLQ_QUEUE: z.string().default('jobs.dead-letter'),
  RABBITMQ_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_INTERNAL_URL: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  DOCUMENTS_STORAGE_BUCKET: z.string().default('cdoprof-dev')
});

export const workerEnv = workerEnvSchema.parse(process.env);
