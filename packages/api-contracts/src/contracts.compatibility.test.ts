import { describe, expect, it } from 'vitest';
import { ApiErrorCodes, type ErrorEnvelope } from './errors/contracts';
import { type ResponseMeta } from './meta/contracts';

describe('API contract compatibility', () => {
  it('preserves canonical error-code set', () => {
    expect(Object.values(ApiErrorCodes)).toEqual([
      'VALIDATION_ERROR',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'PRECONDITION_FAILED',
      'RATE_LIMITED',
      'INTERNAL_ERROR'
    ]);
  });

  it('keeps request_id and timestamp in response meta', () => {
    const meta: ResponseMeta = {
      request_id: 'req_123',
      timestamp: '2026-01-01T00:00:00.000Z'
    };

    expect(meta.request_id).toMatch(/^req_/);
    expect(meta.timestamp).toContain('T');
  });

  it('keeps error envelope shape backward compatible', () => {
    const envelope: ErrorEnvelope<typeof ApiErrorCodes.FORBIDDEN> = {
      error: {
        code: ApiErrorCodes.FORBIDDEN,
        message: 'Forbidden'
      },
      meta: {
        request_id: 'req_42',
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    };

    expect(envelope.error.code).toBe('FORBIDDEN');
    expect(envelope.meta.request_id).toBeTypeOf('string');
    expect(envelope.meta.timestamp).toBeTypeOf('string');
  });
});
