import { describe, expect, it } from 'vitest';

import { MockEsiaProvider, encodeMockCode } from './mock-esia.provider.js';

describe('MockEsiaProvider', () => {
  const p = new MockEsiaProvider();

  it('round-trips the СНИЛС baked into the code', async () => {
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Иванов', firstName: 'Иван' });
    const id = await p.exchangeCode({ code, state: 's', redirectUri: 'r' });
    expect(id.snils).toBe('11223344595');
    expect(id.lastName).toBe('Иванов');
  });

  it('buildAuthorizeUrl points back at the redirectUri with a code param', () => {
    const url = p.buildAuthorizeUrl({ state: 'st', purpose: 'login', redirectUri: 'http://x/cb' });
    expect(url).toContain('http://x/cb');
    expect(url).toContain('state=st');
    expect(url).toContain('code=');
  });
});
