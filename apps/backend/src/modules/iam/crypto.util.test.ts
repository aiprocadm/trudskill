import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashRefreshToken, issueToken, verifyPassword, hashPassword } from './crypto.util.js';

describe('crypto util', () => {
  it('verifies password hash', () => {
    const hash = hashPassword('Password123!');
    expect(verifyPassword('Password123!', hash)).toBe(true);
  });

  it('does not use deterministic sha256 password hashing', () => {
    const plain = 'Password123!';
    const legacySha256 = createHash('sha256').update(`pwd:${plain}`).digest('hex');

    const first = hashPassword(plain);
    const second = hashPassword(plain);

    expect(first).not.toBe(legacySha256);
    expect(second).not.toBe(legacySha256);
    expect(first).not.toBe(second);
  });

  it('creates stable refresh hash with secret', () => {
    expect(hashRefreshToken('abc', 'secret-key')).toBe(hashRefreshToken('abc', 'secret-key'));
    expect(hashRefreshToken('abc', 'secret-key')).not.toBe(
      hashRefreshToken('abc', 'another-secret')
    );
  });

  it('issues high-entropy refresh tokens', () => {
    const token = issueToken();
    expect(token.length).toBeGreaterThanOrEqual(80);
  });
});
