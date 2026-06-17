import { describe, expect, it } from 'vitest';

import { type AuthMethod } from './auth.service.js';

describe('AuthMethod', () => {
  it("includes 'esia'", () => {
    const m: AuthMethod = 'esia';
    expect(m).toBe('esia');
  });
});
