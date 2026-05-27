import { describe, expect, it } from 'vitest';

import { TableOfContents } from './table-of-contents';

describe('TableOfContents', () => {
  it('экспортируется как функциональный компонент', () => {
    expect(typeof TableOfContents).toBe('function');
  });
});
