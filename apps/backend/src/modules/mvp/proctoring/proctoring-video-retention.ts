import { addDays } from '../../../common/utils/date-math.util.js';

/**
 * Spec §10 (single owner-confirmable item): videos are deleted 365 days after the session
 * ended. Change THIS constant if the owner picks a different term — no env var needed,
 * the cron is dormant behind PROCTORING_VIDEO_RETENTION_ENABLED anyway.
 */
export const PROCTORING_VIDEO_RETENTION_DAYS = 365;

export interface ProctoringRetentionCandidate {
  id: string;
  startedAt: string;
  completedAt?: string | undefined;
  purgedAt?: string | undefined;
  chunks: Array<{ fileId: string }>;
}

/**
 * Pure selection: not yet purged, has chunk files, and `(completedAt ?? startedAt)` is older
 * than the retention window. NOTE deliberately NO status filter (unlike identity's
 * approved|rejected requirement): abandoned 'recording' sessions age out too — there is no
 * separate reaper (spec §2.7). `asOf` is an ISO date (YYYY-MM-DD).
 */
export function selectProctoringRecordingsToPurge<T extends ProctoringRetentionCandidate>(
  asOf: string,
  records: T[],
  retentionDays: number = PROCTORING_VIDEO_RETENTION_DAYS
): T[] {
  return records.filter((r) => {
    if (r.purgedAt) return false;
    if (r.chunks.length === 0) return false;
    const anchor = r.completedAt ?? r.startedAt;
    return addDays(anchor.slice(0, 10), retentionDays) <= asOf;
  });
}
