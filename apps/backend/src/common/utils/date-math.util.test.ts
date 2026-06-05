import { describe, expect, it } from 'vitest';

import { addDays, addMonths } from './date-math.util.js';

describe('addMonths', () => {
  it('adds whole months and returns a YYYY-MM-DD date', () => {
    expect(addMonths('2026-06-04', 12)).toBe('2027-06-04');
    expect(addMonths('2026-06-04', 36)).toBe('2029-06-04');
  });

  it('clamps to the last day of the target month on overflow', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap year
  });

  it('accepts an ISO timestamp and ignores the time part', () => {
    expect(addMonths('2026-06-04T15:30:00.000Z', 1)).toBe('2026-07-04');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-06-04', 90)).toBe('2026-09-02');
  });
});
