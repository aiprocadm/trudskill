import { describe, expect, it } from 'vitest';
import { hashRefreshToken, issueToken, verifyPassword, hashPassword } from './crypto.util.js';

describe('crypto util', () => {
  it('verifies password hash', () => {
    const hash = hashPassword('Password123!');
    expect(verifyPassword('Password123!', hash)).toBe(true);
  });

  it('creates stable refresh hash', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
  });

  it('issues tokens', () => {
    expect(issueToken()).not.toHaveLength(0);
  });
});
