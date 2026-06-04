export const DOCUMENT_REVOKED_EVENT = 'documents.revoked' as const;

export interface DocumentRevokedPayload {
  tenantId: string;
  documentId: string;
  /** Source entity the document was issued for (e.g. 'enrollment' + enrollmentId) — used by the 5B listener to resolve the learner recipient. */
  sourceEntityType?: string;
  sourceEntityId?: string;
  reason: string;
  actorId?: string;
  revokedAt?: string;
  requestId?: string;
  correlationId?: string;
}
