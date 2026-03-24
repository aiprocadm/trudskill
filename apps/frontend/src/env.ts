import { z } from 'zod';

const frontendEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url()
});

export const frontendEnv = frontendEnvSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
});
