import { describe, expect, it } from 'vitest';

import { PageContainer, StatusChip } from './index';

describe('ui', () => {
  it('exports ui primitives and components', () => {
    expect(typeof PageContainer).toBe('function');
    expect(typeof StatusChip).toBe('function');
  });
});
