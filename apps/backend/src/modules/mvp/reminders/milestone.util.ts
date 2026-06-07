import { addDays } from '../../../common/utils/date-math.util.js';

/** Recertification reminder thresholds (days before expiry), ascending. */
export const RECERT_MILESTONES = [7, 30, 90] as const;

/** Course-deadline reminder thresholds (days before planned completion), ascending. */
export const COURSE_DEADLINE_MILESTONES = [1, 7, 14] as const;

/**
 * Return the smallest threshold `t` (from `thresholdsAsc`) such that `target` falls on or
 * before `asOf + t` days; `null` when `target` is beyond the largest threshold. Both dates
 * are normalized to their `YYYY-MM-DD` part, so an ISO timestamp `target` compares correctly.
 */
export function pickMilestone(
  asOf: string,
  target: string,
  thresholdsAsc: readonly number[]
): number | null {
  const asOfDate = asOf.slice(0, 10);
  const targetDate = target.slice(0, 10);
  for (const t of thresholdsAsc) {
    if (targetDate <= addDays(asOfDate, t)) {
      return t;
    }
  }
  return null;
}
