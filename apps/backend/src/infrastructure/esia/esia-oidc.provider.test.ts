import { describe, expect, it } from 'vitest';

import { EsiaOidcProvider } from './esia-oidc.provider.js';

describe('EsiaOidcProvider (stub)', () => {
  const p = new EsiaOidcProvider({
    clientId: 'mn',
    authorizeUrl: 'https://esia/aas',
    scopes: 'openid'
  });

  it('builds an authorize URL with client_id/scope/state/redirect_uri', () => {
    const url = p.buildAuthorizeUrl({
      state: 'st',
      purpose: 'login',
      redirectUri: 'https://app/cb'
    });
    expect(url).toContain('https://esia/aas');
    expect(url).toContain('client_id=mn');
    expect(url).toContain('state=st');
  });

  it('exchangeCode is not implemented until ГОСТ signing is wired', async () => {
    await expect(p.exchangeCode({ code: 'c', state: 's', redirectUri: 'r' })).rejects.toThrow(
      /not implemented/i
    );
  });
});
