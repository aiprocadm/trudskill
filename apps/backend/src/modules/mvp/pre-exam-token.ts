import { createHash, randomBytes } from 'node:crypto';

import { backendEnv } from '../../env.js';

/** Token lifetime — mirrors the magic-link 15-minute default. */
export const PRE_EXAM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** High-entropy, URL-safe raw token. Only ever exists in the e-mailed link. */
export function generatePreExamToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex of the raw token; only the hash is persisted. */
export function hashPreExamToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Public verify-link the learner clicks (mirrors buildMagicLinkUrl). */
export function buildPreExamAuthUrl(rawToken: string): string {
  const base = backendEnv.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/exam-auth/${encodeURIComponent(rawToken)}`;
}
