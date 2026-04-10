import { z } from 'zod';

const frontendEnvSchema = z.object({
  /** Origin + префикс API (например http://localhost:3001/api/v1), как у Nest setGlobalPrefix(API_PREFIX) */
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_REALTIME_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_TENANT_ID: z.string().min(1).default('tenant_demo')
});

export const frontendEnv = frontendEnvSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  NEXT_PUBLIC_DEFAULT_TENANT_ID: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? 'tenant_demo'
});

export type FrontendEnv = typeof frontendEnv;
