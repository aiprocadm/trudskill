import { describe, expect, it } from 'vitest';

import { resolveSafeNextPath } from './login-form';
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

  it('allows only internal next paths', () => {
    expect(resolveSafeNextPath('/courses/123')).toBe('/courses/123');
    expect(resolveSafeNextPath('/')).toBe('/');
  });

  it('falls back to root for empty or unsafe next paths', () => {
    expect(resolveSafeNextPath(null)).toBe('/');
    expect(resolveSafeNextPath('')).toBe('/');
    expect(resolveSafeNextPath('https://evil.example')).toBe('/');
    expect(resolveSafeNextPath('//evil.example')).toBe('/');
    expect(resolveSafeNextPath('courses')).toBe('/');
  });
});
