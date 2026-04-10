import { describe, expect, it } from 'vitest';

import ForbiddenPage from './forbidden/page';
import DashboardPage from './page';

describe('frontend routes', () => {
  it('exports dashboard page component', () => {
    expect(typeof DashboardPage).toBe('function');
  });

  it('renders forbidden route component', () => {
    expect(typeof ForbiddenPage).toBe('function');
  });
});
