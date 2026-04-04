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
  DOCUMENT_GENERATION_QUEUE: z.string().default('documents.generation'),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_INTERNAL_URL: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  DOCUMENTS_STORAGE_BUCKET: z.string().default('cdoprof-dev')
});

export const workerEnv = workerEnvSchema.parse(process.env);
