import { describe, expect, it } from 'vitest';
import DashboardPage from './page';
import ForbiddenPage from './forbidden/page';

describe('frontend routes', () => {
  it('exports dashboard page component', () => {
    expect(typeof DashboardPage).toBe('function');
  });

  it('renders forbidden route component', () => {
    expect(typeof ForbiddenPage).toBe('function');
  });
});
