import { describe, expect, it } from 'vitest';

import { resolveSafeNextPath } from './login-form';
import { ApiClientError } from '../../lib/api/client';

describe('login form error mapping', () => {
  it('keeps backend message from normalized error', () => {
    const error = new ApiClientError({
      status: 401,
      code: 'invalid_credentials',
      message: 'Invalid credentials'
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

  /*
   * Фаза 6 Task 1: форма входа теперь пользуется строгим разбором из `next-target.ts`.
   * Эти три варианта — те самые, что проходили сквозь прежнюю проверку «начинается
   * с одного слэша» и уводили человека на чужой сайт с формой-двойником.
   */
  it('не уводит на чужой сайт обратным слэшем, управляющим символом и точечным сегментом', () => {
    expect(resolveSafeNextPath('/\\evil.example')).toBe('/');
    expect(resolveSafeNextPath('/\t/evil.example')).toBe('/');
    expect(resolveSafeNextPath('/..//evil.example')).toBe('/');
  });
});
