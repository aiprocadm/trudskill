import { describe, expect, it } from 'vitest';
import { createHealthFixture } from './index';

describe('test-utils', () => {
  it('creates a health fixture', () => {
    expect(createHealthFixture('worker').service).toBe('worker');
  });
});
