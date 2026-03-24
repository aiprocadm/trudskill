import { describe, expect, it } from 'vitest';
import { backendEnv } from './env';

describe('backend env', () => {
  it('has default port when omitted', () => {
    expect(backendEnv.BACKEND_PORT).toBeGreaterThan(0);
  });
});
