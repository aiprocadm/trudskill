import { describe, expect, it } from 'vitest';

import { devSeed } from './dev-seed.js';

describe('dev seed', () => {
  it('contains deterministic tenant and role setup', () => {
    expect(devSeed.tenants[0]?.id).toBe('tenant_demo');
    expect(devSeed.roles).toEqual([
      'platform_admin',
      'tenant_admin',
      'manager',
      'methodist',
      'learner'
    ]);
    expect(devSeed.users).toHaveLength(6);
  });
});
