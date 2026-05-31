import { describe, expect, it } from 'vitest';

import {
  PRE_EXAM_TOKEN_TTL_MS,
  buildPreExamAuthUrl,
  generatePreExamToken,
  hashPreExamToken
} from './pre-exam-token.js';

describe('pre-exam-token crypto', () => {
  it('generates a high-entropy url-safe raw token', () => {
    const token = generatePreExamToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('generates a different token each call', () => {
    expect(generatePreExamToken()).not.toBe(generatePreExamToken());
  });

  it('hashes deterministically to a 64-char sha-256 hex', () => {
    const hash = hashPreExamToken('abc');
    expect(hash).toBe(hashPreExamToken('abc'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not store the raw token in its hash', () => {
    const raw = generatePreExamToken();
    expect(hashPreExamToken(raw)).not.toContain(raw);
  });

  it('builds a verify URL that embeds the (encoded) raw token', () => {
    const url = buildPreExamAuthUrl('a b/c');
    expect(url).toContain('/exam-auth/');
    expect(url).toContain(encodeURIComponent('a b/c'));
  });

  it('uses a 15-minute TTL', () => {
    expect(PRE_EXAM_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });
});
