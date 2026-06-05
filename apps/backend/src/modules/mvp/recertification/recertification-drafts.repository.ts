export const RECERTIFICATION_DRAFTS_REPOSITORY = Symbol('RECERTIFICATION_DRAFTS_REPOSITORY');

export type RecertificationDraftStatus = 'pending' | 'approved' | 'rejected';

export interface RecertificationDraftRow {
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

export interface RecertificationDraftSeed {
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
}

export interface RecertificationDraftsQuery {
  status?: RecertificationDraftStatus;
}

export interface RecertificationDraftsRepository {
  create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }>;
  list(tenantId: string, query: RecertificationDraftsQuery): Promise<RecertificationDraftRow[]>;
  getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null>;
  markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null>;
  markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null>;
}
