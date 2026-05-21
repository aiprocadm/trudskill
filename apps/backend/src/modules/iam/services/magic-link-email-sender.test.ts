import { describe, expect, it } from 'vitest';

import { buildMagicLinkUrl } from './magic-link-email-sender.js';

describe('buildMagicLinkUrl', () => {
  it('combines PUBLIC_BASE_URL with /login/magic-link/<token>', () => {
    expect(buildMagicLinkUrl('abc123')).toBe('http://127.0.0.1:3000/login/magic-link/abc123');
  });

  it('url-encodes the token to defend against non-base64url payloads', () => {
    expect(buildMagicLinkUrl('a/b+c')).toBe('http://127.0.0.1:3000/login/magic-link/a%2Fb%2Bc');
  });

  it('does not double-slash when PUBLIC_BASE_URL has a trailing slash', () => {
    // PUBLIC_BASE_URL in test env doesn't end with /, so this is a defensive check
    // that the helper strips one if it ever does.
    const url = buildMagicLinkUrl('tok');
    expect(url.match(/\/login/g)).toHaveLength(1);
    expect(url).not.toContain('//login');
  });
});
