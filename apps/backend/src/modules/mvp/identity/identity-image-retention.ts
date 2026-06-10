import { addDays } from '../../../common/utils/date-math.util.js';

/** 152-ФЗ data minimization: images are deleted N days after the review decision. */
export const IDENTITY_IMAGE_RETENTION_DAYS = 90;

export interface IdentityRetentionCandidate {
  id: string;
  verificationStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  reviewedAt?: string | undefined;
  imagesPurgedAt?: string | undefined;
  selfieFileId?: string | undefined;
  passportFileId?: string | undefined;
}

/**
 * Pure selection: decided (approved|rejected) records whose review is older than the
 * retention window, still holding image file ids. Mirrors scanForRecertification's shape.
 * `asOf` is an ISO date (YYYY-MM-DD).
 */
export function selectIdentityImagesToPurge<T extends IdentityRetentionCandidate>(
  asOf: string,
  records: T[],
  retentionDays: number = IDENTITY_IMAGE_RETENTION_DAYS
): T[] {
  return records.filter((r) => {
    if (r.verificationStatus !== 'approved' && r.verificationStatus !== 'rejected') return false;
    if (!r.reviewedAt || r.imagesPurgedAt) return false;
    if (!r.selfieFileId && !r.passportFileId) return false;
    return addDays(r.reviewedAt.slice(0, 10), retentionDays) <= asOf;
  });
}
