/**
 * Phase 5C — типы UI очереди переаттестации. Дублируем backend-union на фронте,
 * чтобы лейблы статусов проверялись на этапе компиляции (как в licenses/types.ts).
 */

export type RecertificationDraftStatus = 'pending' | 'approved' | 'rejected';

/** Raw row as returned by reject/scan endpoints (без обогащения). */
export interface RecertificationDraft {
  id: string;
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
  status: RecertificationDraftStatus;
  resultingEnrollmentId?: string;
  reason?: string;
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Enriched row returned by GET /recertification-drafts (list). */
export interface RecertificationDraftView extends RecertificationDraft {
  learnerName: string;
  learnerSnils?: string;
  courseTitle: string;
}

/** POST /recertification/scan summary. */
export interface RecertScanSummary {
  draftsCreated: number;
  emailsDispatched: number;
}

export const RECERT_STATUS_LABELS: Record<RecertificationDraftStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён'
};
