import { describe, expect, it } from 'vitest';

import { issueSignedAccessToken, verifySignedAccessToken } from './access-token.util.js';

const secret = 'test-jwt-secret-min-10-chars';

describe('access-token.util', () => {
  it('round-trips claims', () => {
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 't1', session_id: 's1', roles: ['admin'] },
      secret,
      3600
    );
    const claims = verifySignedAccessToken(token, secret);
    expect(claims.sub).toBe('u1');
    expect(claims.tenant_id).toBe('t1');
    expect(claims.session_id).toBe('s1');
    expect(claims.roles).toEqual(['admin']);
  });

  it('rejects wrong secret', () => {
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 't1', session_id: 's1', roles: [] },
      secret,
      3600
    );
    expect(() => verifySignedAccessToken(token, 'other-secret-min-10')).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => verifySignedAccessToken('not.a.jwt', secret)).toThrow();
  });
});
