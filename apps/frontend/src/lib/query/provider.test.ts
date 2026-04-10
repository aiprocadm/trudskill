import { describe, expect, it } from 'vitest';

import { defaultQueryPolicy } from './provider';

describe('query policy', () => {
  it('defines auth-sensitive retry behavior', () => {
    expect(defaultQueryPolicy).toEqual({ dedupe: true, safeRetryCount: 2, authSensitiveRetry: false });
  });
});
