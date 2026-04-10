import { describe, expect, it } from 'vitest';

import { createTestTenant, createTestUser } from './index';

describe('test-utils', () => {
  it('creates tenant and user fixtures', () => {
    expect(createTestTenant().id).toBeDefined();
    expect(createTestUser('manager').role).toBe('manager');
  });
});
