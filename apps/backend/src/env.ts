import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { backendEnvSchema, type BackendEnv } from './env.schema.js';

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

export { backendEnvSchema, type BackendEnv };
export const backendEnv = backendEnvSchema.parse(process.env);
