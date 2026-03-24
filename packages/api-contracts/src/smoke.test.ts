import { describe, expect, it } from 'vitest';
import type { HealthResponseContract } from './index';

describe('api-contracts', () => {
  it('builds health response contract envelope', () => {
    const contract: HealthResponseContract = {
      data: { status: 'ok', timestamp: new Date().toISOString(), service: 'backend' },
      meta: { request_id: 'req-1', timestamp: new Date().toISOString() }
    };
    expect(contract.data.status).toBe('ok');
  });
});
