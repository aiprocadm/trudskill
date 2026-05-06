import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  hashRefreshToken,
  isLegacyPwdSha256Hash,
  issueToken,
  verifyPassword
} from './crypto.util.js';

describe('crypto util', () => {
  it('detects legacy IAM seed hashes', () => {
    expect(
      isLegacyPwdSha256Hash('d845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264')
    ).toBe(true);
    expect(isLegacyPwdSha256Hash(hashPassword('x'))).toBe(false);
    expect(isLegacyPwdSha256Hash('not-hex')).toBe(false);
  });

  it('verifies password hash', () => {
    const hash = hashPassword('Password123!');
    expect(verifyPassword('Password123!', hash)).toBe(true);
  });

  it('verifies legacy IAM seed sha256(pwd:plain) hashes from SQL migrations', () => {
    expect(
      verifyPassword(
        'Password123!',
        'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264'
      )
    ).toBe(true);
    expect(
      verifyPassword('wrong', 'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264')
    ).toBe(false);
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
