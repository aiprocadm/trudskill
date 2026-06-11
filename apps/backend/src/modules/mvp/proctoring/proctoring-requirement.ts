/**
 * Phase 4 Plan B: effective proctoring requirement for a learner on a course.
 * `enrollment.proctoringOverride ?? group-course flag` (spec §2.6):
 *   'require' forces it on, 'exempt' forces it off, undefined inherits.
 */
export function resolveProctoringRequirement(
  override: 'require' | 'exempt' | undefined,
  groupCourseRequiresProctoring: boolean
): boolean {
  if (override === 'require') return true;
  if (override === 'exempt') return false;
  return groupCourseRequiresProctoring;
}
