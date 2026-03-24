import { describe, expect, it } from 'vitest';
import { normalizeApiError } from './api-error';

describe('api error normalization', () => {
  it('normalizes error envelope', () => {
    const result = normalizeApiError(403, {
      error: { code: 'FORBIDDEN', message: 'Denied' },
      meta: { request_id: 'req_1', timestamp: '2025-01-01T00:00:00.000Z' }
    });

    expect(result).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Denied', requestId: 'req_1' });
  });
});
