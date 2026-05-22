import { describe, expect, it } from 'vitest';

import LearnerHomePage from './page';

describe('learner home route', () => {
  it('exports a page component function', () => {
    expect(typeof LearnerHomePage).toBe('function');
  });
});
