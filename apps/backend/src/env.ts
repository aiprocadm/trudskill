import { z } from 'zod';

const backendEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url().default('http://postgres.local'),
  REDIS_URL: z.string().url().default('http://redis.local'),
  RABBITMQ_URL: z.string().url().default('http://rabbitmq.local'),
  S3_ENDPOINT: z.string().url().default('http://s3.local'),
  S3_ACCESS_KEY: z.string().min(1).default('dev-access-key'),
  S3_SECRET_KEY: z.string().min(1).default('dev-secret-key'),
  S3_BUCKET: z.string().min(1).default('cdoprof-dev-bucket'),
  AUTH_JWT_SECRET: z.string().min(10).default('dev-jwt-secret-12345'),
  SESSION_SECRET: z.string().min(10).default('dev-session-secret-12345'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
  REALTIME_PUBLIC_URL: z.string().url().default('http://localhost:3002')
});

export type BackendEnv = z.infer<typeof backendEnvSchema>;
export const backendEnv = backendEnvSchema.parse(process.env);
