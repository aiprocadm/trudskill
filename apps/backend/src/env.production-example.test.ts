import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

/**
 * Deploy-readiness guard: infra/.env.production.example MUST produce a bootable backend.
 *
 * The backend validates process.env against backendEnvSchema at boot and refuses to start on
 * any failure. If the example template drifts from the schema (a new required var, a strict-
 * profile violation, an empty-string optional, a stale dev-default), a fresh-server deploy
 * crash-loops before it ever serves a request — and nothing else in CI exercises that file.
 *
 * This test parses the example, substitutes the owner placeholders with valid strong stand-ins
 * (so we test STRUCTURAL validity, not the literal CHANGE_ME strings), and asserts it parses.
 */
const examplePath = [
  join(process.cwd(), 'infra/.env.production.example'),
  join(process.cwd(), '../../infra/.env.production.example')
].find((path) => existsSync(path));

// Owner placeholders → valid strong stand-ins. Mirrors what a real deploy fills in.
const PLACEHOLDER_SUBSTITUTIONS: Record<string, string> = {
  YOUR_DOMAIN: 'cdoprof.example.com',
  CHANGE_ME_DB_PASSWORD: 'Str0ngDbPassw0rdAbc123',
  CHANGE_ME_RABBIT_PASSWORD: 'Str0ngRabbitPassw0rd123',
  CHANGE_ME_MINIO_USER: 'minioadmin_prod_user',
  CHANGE_ME_MINIO_PASSWORD: 'Str0ngMinioPassw0rd123',
  CHANGE_ME_GENERATE_HEX: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
  CHANGE_ME_SMTP_HOST: 'smtp.example.com',
  CHANGE_ME_SMTP_USER: 'smtp_user',
  CHANGE_ME_SMTP_PASSWORD: 'Str0ngSmtpPassw0rd123',
  'replace-with-strong-random-64-chars': 'd0c1a2b3e4f5d0c1a2b3e4f5d0c1a2b3e4f5d0c1a2b3e4f5'
};

function parseExampleEnv(contents: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    for (const [placeholder, replacement] of Object.entries(PLACEHOLDER_SUBSTITUTIONS)) {
      value = value.split(placeholder).join(replacement);
    }
    env[key] = value;
  }
  return env;
}

describe('infra/.env.production.example', () => {
  it('parses cleanly against the boot-time backend env schema', () => {
    expect(examplePath, '.env.production.example not found').toBeDefined();
    const env = parseExampleEnv(readFileSync(examplePath!, 'utf8'));

    const parsed = backendEnvSchema.safeParse(env);
    const issues = parsed.success
      ? []
      : parsed.error.issues.map((i) => `[${i.path.join('.') || 'refine'}] ${i.message}`);

    expect(issues, `boot-time schema rejected the prod example:\n${issues.join('\n')}`).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('declares the production strict profile (NODE_ENV + DEPLOYMENT_PROFILE)', () => {
    const env = parseExampleEnv(readFileSync(examplePath!, 'utf8'));
    expect(env.NODE_ENV).toBe('production');
    expect(env.DEPLOYMENT_PROFILE).toBe('prod');
  });
});
