import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../lib/api/client';

describe('login form error mapping', () => {
  it('keeps backend message from normalized error', () => {
    const error = new ApiClientError({
      status: 401,
      code: 'invalid_credentials',
      message: 'Invalid credentials',
      isAuthError: true
    });

    expect(error.normalized.message).toBe('Invalid credentials');
  });
});
