import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('frontend', () => {
  it('renders home page component', () => {
    expect(typeof HomePage).toBe('function');
  });
});
