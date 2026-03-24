import { describe, expect, it } from 'vitest';
import { DemoCard } from './index';

describe('ui', () => {
  it('exports DemoCard', () => {
    expect(typeof DemoCard).toBe('function');
  });
});
