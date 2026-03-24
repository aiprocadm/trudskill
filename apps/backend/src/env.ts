import { z } from 'zod';

const backendEnvSchema = z.object({
  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(10),
  SESSION_SECRET: z.string().min(10),
  CORS_ORIGIN: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  REALTIME_PUBLIC_URL: z.string().url()
});

export const backendEnv = backendEnvSchema.parse(process.env);
