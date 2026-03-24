import { describe, expect, it } from 'vitest';
import type { HealthStatus } from './index';

describe('shared-types', () => {
  it('exposes HealthStatus type shape', () => {
    const value: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'backend'
    };

    expect(value.status).toBe('ok');
  });
});
