import { describe, expect, it } from 'vitest';

import { resolveProctoringRequirement } from './proctoring-requirement.js';

describe('resolveProctoringRequirement (override × group-course flag matrix)', () => {
  it.each([
    // [override, groupCourseFlag, expected]
    [undefined, false, false],
    [undefined, true, true],
    ['require', false, true],
    ['require', true, true],
    ['exempt', false, false],
    ['exempt', true, false]
  ] as const)('override=%s flag=%s → %s', (override, flag, expected) => {
    expect(resolveProctoringRequirement(override, flag)).toBe(expected);
  });
});
