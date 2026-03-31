import { z } from 'zod';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envCandidates = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '.env'),
  join(process.cwd(), '..', '..', '.env')
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

export const backendEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RELEASE_VERSION: z.string().default('dev'),
    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    API_PREFIX: z.string().default('/api/v1'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    RABBITMQ_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    AUTH_JWT_SECRET: z.string().min(10),
    SESSION_SECRET: z.string().min(10),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
    DB_MIGRATIONS_ENABLED: z.coerce.boolean().default(true),
    DB_MIGRATIONS_DIR: z.string().default('migrations'),
    CORS_ORIGIN: z.string().url(),
    PUBLIC_BASE_URL: z.string().url(),
    REALTIME_PUBLIC_URL: z.string().url(),
    ALLOW_IN_MEMORY_STATE: z.coerce.boolean().default(false)
  })
  .superRefine((env, ctx) => {
    const devSecrets = ['change-me-in-production', 'dev-jwt-secret-12345', 'dev-session-secret-12345'];
    if (env.NODE_ENV === 'production' && devSecrets.includes(env.AUTH_JWT_SECRET)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AUTH_JWT_SECRET must not use development value in production' });
    }
    if (env.NODE_ENV === 'production' && devSecrets.includes(env.SESSION_SECRET)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SESSION_SECRET must not use development value in production' });
    }
    if (env.NODE_ENV === 'production' && env.ALLOW_IN_MEMORY_STATE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ALLOW_IN_MEMORY_STATE must be false in production' });
    }
  });

export type BackendEnv = z.infer<typeof backendEnvSchema>;
export const backendEnv = backendEnvSchema.parse(process.env);
