import { z } from 'zod';

const frontendEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_REALTIME_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_TENANT_ID: z.string().min(1).default('tenant_demo')
});

export const frontendEnv = frontendEnvSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  NEXT_PUBLIC_DEFAULT_TENANT_ID: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? 'tenant_demo'
});

export type FrontendEnv = typeof frontendEnv;
