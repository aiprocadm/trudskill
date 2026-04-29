import { describe, expect, it } from 'vitest';

import { getJourneyByRole, roleJourneys } from './role-journeys';

describe('role journeys', () => {
  it('contains all critical LMS roles', () => {
    const roles = roleJourneys.map((item) => item.role);
    expect(roles).toEqual(expect.arrayContaining(['learner', 'teacher', 'methodist', 'tenant_admin']));
  });

  it('returns journey for known role and null for unknown role', () => {
    expect(getJourneyByRole('learner')?.steps.length).toBeGreaterThan(0);
    expect(getJourneyByRole('unknown')).toBeNull();
  });
});
