import { describe, expect, it } from 'vitest';

import { esiaAuthorizeUrl, shouldShowEsiaButton } from './esia-login-button';

describe('ЕСИА login button', () => {
  it('hidden when the flag is off', () => {
    expect(shouldShowEsiaButton(false)).toBe(false);
  });
  it('shown when the flag is on', () => {
    expect(shouldShowEsiaButton(true)).toBe(true);
  });
  it('builds the backend authorize URL with tenant + purpose=login', () => {
    const url = esiaAuthorizeUrl('http://api/v1', 'tenant_demo');
    expect(url).toBe('http://api/v1/auth/esia/authorize?purpose=login&tenant_id=tenant_demo');
  });
});
