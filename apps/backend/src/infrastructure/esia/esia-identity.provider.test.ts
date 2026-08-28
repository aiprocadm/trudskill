import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { type EsiaIdentityProvider, NoopEsiaProvider } from './esia-identity.provider.js';

describe('NoopEsiaProvider', () => {
  const p: EsiaIdentityProvider = new NoopEsiaProvider();

  it('buildAuthorizeUrl refuses when ЕСИА is disabled', () => {
    expect(() => p.buildAuthorizeUrl({ state: 's', purpose: 'login', redirectUri: 'r' })).toThrow(
      ServiceUnavailableException
    );
  });

  it('exchangeCode refuses when ЕСИА is disabled', async () => {
    await expect(p.exchangeCode({ code: 'c', state: 's', redirectUri: 'r' })).rejects.toThrow(
      ServiceUnavailableException
    );
  });
});
