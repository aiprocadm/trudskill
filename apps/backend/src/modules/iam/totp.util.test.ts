import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotpSecret,
  signTotpChallenge,
  totpCodeForStep,
  totpStep,
  verifyTotpChallenge,
  verifyTotpCode
} from './totp.util.js';

/** Эталонный секрет приложения B RFC 6238 (ASCII "12345678901234567890"). */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32', () => {
  it('encodes the RFC 4648 test vectors', () => {
    expect(base32Encode(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
    expect(base32Encode(Buffer.from('fooba', 'ascii'))).toBe('MZXW6YTB');
  });

  it('round-trips a generated secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/); // 20 байт → 32 символа
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('rejects non-alphabet input', () => {
    expect(() => base32Decode('MZXW6YT!')).toThrow('invalid_base32');
  });
});

describe('totpCodeForStep — эталонные вектора RFC 6238 (приложение B, SHA1)', () => {
  // Вектора даны для 8 цифр; наш 6-значный код — их младшие 6 цифр.
  const vectors: Array<[unixSeconds: number, eightDigits: string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037']
  ];
  for (const [seconds, eight] of vectors) {
    it(`T=${seconds} → ${eight.slice(-6)}`, () => {
      expect(totpCodeForStep(RFC_SECRET, totpStep(seconds * 1000))).toBe(eight.slice(-6));
    });
  }
});

describe('verifyTotpCode', () => {
  const nowMs = 1_111_111_109_000;

  it('accepts the current-step code and returns the step', () => {
    const code = totpCodeForStep(RFC_SECRET, totpStep(nowMs));
    expect(verifyTotpCode(RFC_SECRET, code, { nowMs })).toBe(totpStep(nowMs));
  });

  it('accepts the previous and next step (clock drift window ±1)', () => {
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, totpStep(nowMs) - 1), { nowMs })
    ).toBe(totpStep(nowMs) - 1);
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, totpStep(nowMs) + 1), { nowMs })
    ).toBe(totpStep(nowMs) + 1);
  });

  it('rejects a code two steps away', () => {
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, totpStep(nowMs) + 2), { nowMs })
    ).toBeNull();
  });

  it('rejects a replayed step via minStepExclusive (anti-replay)', () => {
    const step = totpStep(nowMs);
    const code = totpCodeForStep(RFC_SECRET, step);
    expect(verifyTotpCode(RFC_SECRET, code, { nowMs, minStepExclusive: step })).toBeNull();
    expect(verifyTotpCode(RFC_SECRET, code, { nowMs, minStepExclusive: step - 1 })).toBe(step);
  });

  it('rejects malformed codes without touching crypto', () => {
    expect(verifyTotpCode(RFC_SECRET, '12345', { nowMs })).toBeNull();
    expect(verifyTotpCode(RFC_SECRET, 'abcdef', { nowMs })).toBeNull();
    expect(verifyTotpCode(RFC_SECRET, '', { nowMs })).toBeNull();
  });
});

describe('buildOtpauthUrl', () => {
  it('builds a scannable otpauth URL with issuer and account', () => {
    const url = buildOtpauthUrl({
      secretBase32: 'ABC234',
      accountName: 'tenant_admin@tenant_demo',
      issuer: 'trudskill'
    });
    expect(url).toContain('otpauth://totp/trudskill:tenant_admin%40tenant_demo?');
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('issuer=trudskill');
    expect(url).toContain('period=30');
    expect(url).toContain('digits=6');
  });
});

describe('totp challenge (второй шаг логина)', () => {
  const SECRET = 'test-signing-secret';
  const nowMs = 1_700_000_000_000;
  const payload = {
    sub: 'u_tenant_admin',
    tenant_id: 'tenant_demo',
    method: 'password' as const,
    database_backed: true
  };

  it('signs and verifies a round-trip', () => {
    const token = signTotpChallenge(payload, SECRET, nowMs);
    const parsed = verifyTotpChallenge(token, SECRET, nowMs + 60_000);
    expect(parsed).toMatchObject(payload);
  });

  it('rejects an expired challenge (TTL 5 минут)', () => {
    const token = signTotpChallenge(payload, SECRET, nowMs);
    expect(() => verifyTotpChallenge(token, SECRET, nowMs + 6 * 60_000)).toThrow('expired');
  });

  it('rejects a tampered payload and a wrong secret', () => {
    const token = signTotpChallenge(payload, SECRET, nowMs);
    const [encoded, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, sub: 'u_attacker', iat: 1, exp: 9_999_999_999 })
    ).toString('base64url');
    expect(() => verifyTotpChallenge(`${forged}.${sig}`, SECRET, nowMs)).toThrow(
      'invalid_signature'
    );
    expect(() => verifyTotpChallenge(`${encoded}.${sig}`, 'other-secret', nowMs)).toThrow(
      'invalid_signature'
    );
  });

  it('a challenge token is not a JWT (cannot be presented as a bearer token)', () => {
    const token = signTotpChallenge(payload, SECRET, nowMs);
    expect(token.split('.')).toHaveLength(2); // JWT — три части
  });
});
