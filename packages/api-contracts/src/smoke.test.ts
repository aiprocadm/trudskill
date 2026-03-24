import { describe, expect, it } from 'vitest';
import type { HealthResponseContract } from './index';

describe('api-contracts', () => {
  it('builds health response contract', () => {
    const contract: HealthResponseContract = {
      data: { status: 'ok', timestamp: new Date().toISOString(), service: 'backend' }
    };
    expect(contract.data.status).toBe('ok');
  });
});
