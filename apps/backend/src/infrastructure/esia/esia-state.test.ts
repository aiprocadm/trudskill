import { describe, expect, it } from 'vitest';

import { signEsiaState, verifyEsiaState } from './esia-state.js';

const secret = 'unit-secret';

describe('esia state token', () => {
  it('round-trips a valid signed state', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    const claims = verifyEsiaState(token, secret, 1100);
    expect(claims).toMatchObject({ purpose: 'login', tenantId: 't1', nonce: 'n1' });
  });

  it('round-trips the identity learnerId', () => {
    const token = signEsiaState(
      { purpose: 'identity', tenantId: 't1', nonce: 'n1', learnerId: 'lrn_1' },
      secret,
      300,
      1000
    );
    const claims = verifyEsiaState(token, secret, 1100);
    expect(claims).toMatchObject({
      purpose: 'identity',
      tenantId: 't1',
      nonce: 'n1',
      learnerId: 'lrn_1'
    });
  });

  it('rejects a tampered token', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    expect(() => verifyEsiaState(token + 'x', secret, 1100)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    expect(() => verifyEsiaState(token, secret, 1000 + 301_000)).toThrow();
  });
});
