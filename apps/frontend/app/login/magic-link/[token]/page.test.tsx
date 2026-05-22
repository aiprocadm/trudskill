import { describe, expect, it } from 'vitest';

import MagicLinkRedeemPage from './page';

describe('magic-link redeem route', () => {
  it('exports a client component function', () => {
    expect(typeof MagicLinkRedeemPage).toBe('function');
  });
});
