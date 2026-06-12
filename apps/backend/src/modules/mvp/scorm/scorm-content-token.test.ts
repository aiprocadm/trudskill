import { describe, expect, it } from 'vitest';

import { createScormContentToken, verifyScormContentToken } from './scorm-content-token.js';

const SECRET = 'test-secret-0123456789';

describe('scorm content token', () => {
  it('round-trip: подписали → верифицировали payload', () => {
    const token = createScormContentToken({ tenantId: 'tenant_demo', packageId: 'scp_1' }, SECRET, {
      ttlSeconds: 3600,
      nowEpochSeconds: 1_000_000
    });
    const payload = verifyScormContentToken(token, SECRET, { nowEpochSeconds: 1_000_100 });
    expect(payload).toEqual({ tenantId: 'tenant_demo', packageId: 'scp_1', exp: 1_003_600 });
  });

  it('просроченный токен → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    expect(verifyScormContentToken(token, SECRET, { nowEpochSeconds: 1_000_061 })).toBeNull();
  });

  it('подделка подписи → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    const [body] = token.split('.');
    expect(
      verifyScormContentToken(`${body}.AAAA`, SECRET, { nowEpochSeconds: 1_000_001 })
    ).toBeNull();
  });

  it('подмена payload под старую подпись → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    const sig = token.split('.')[1];
    const forgedBody = Buffer.from(
      JSON.stringify({ tenantId: 'other', packageId: 'p', exp: 2_000_000 })
    ).toString('base64url');
    expect(
      verifyScormContentToken(`${forgedBody}.${sig}`, SECRET, { nowEpochSeconds: 1_000_001 })
    ).toBeNull();
  });

  it('мусор вместо токена → null (не бросает)', () => {
    expect(verifyScormContentToken('garbage', SECRET, { nowEpochSeconds: 1 })).toBeNull();
    expect(verifyScormContentToken('a.b.c', SECRET, { nowEpochSeconds: 1 })).toBeNull();
  });
});
