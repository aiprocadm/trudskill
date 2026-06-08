import { describe, expect, it } from 'vitest';

import { COURSE_DEADLINE_MILESTONES, RECERT_MILESTONES, pickMilestone } from './milestone.util.js';

const ASOF = '2026-06-05';

describe('pickMilestone', () => {
  it('returns the smallest satisfied threshold', () => {
    expect(pickMilestone(ASOF, '2026-08-01', RECERT_MILESTONES)).toBe(90);
    expect(pickMilestone(ASOF, '2026-06-30', RECERT_MILESTONES)).toBe(30);
    expect(pickMilestone(ASOF, '2026-06-08', RECERT_MILESTONES)).toBe(7);
  });

  it('returns the most-urgent milestone for an already-expired date', () => {
    expect(pickMilestone(ASOF, '2026-01-01', RECERT_MILESTONES)).toBe(7);
  });

  it('returns null when the date is beyond the largest threshold', () => {
    expect(pickMilestone(ASOF, '2027-01-01', RECERT_MILESTONES)).toBeNull();
  });

  it('normalizes an ISO timestamp target to its date part', () => {
    expect(pickMilestone(ASOF, '2026-06-15T09:00:00.000Z', COURSE_DEADLINE_MILESTONES)).toBe(14);
  });
});
