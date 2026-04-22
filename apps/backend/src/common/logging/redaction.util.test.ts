import { describe, expect, it } from 'vitest';

import { redactValue } from './redaction.util.js';

describe('redaction util', () => {
  it('redacts sensitive keys recursively', () => {
    const output = redactValue({
      password: 'secret',
      nested: { accessToken: 'abc', value: 123 },
      arr: [{ apiKey: 'x' }],
      email: 'user@example.com'
    });

    expect(output).toEqual({
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', value: 123 },
      arr: [{ apiKey: '[REDACTED]' }],
      email: '[REDACTED]'
    });
  });
});
