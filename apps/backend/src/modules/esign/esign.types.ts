export type EsignApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'reused';
export type EsignApplicationFileStatus = 'uploaded' | 'verified' | 'rejected';
export type SigningProcessStatus = 'draft' | 'prepared' | 'awaiting_participants' | 'in_signing' | 'signed' | 'failed' | 'cancelled';
export type SigningParticipantStatus = 'pending' | 'invited' | 'viewed' | 'signed' | 'rejected' | 'skipped' | 'expired';
export type SigningParticipantType = 'learner' | 'commission_member' | 'employee';

export interface EsignApplicationEntity { id: string; tenantId: string; learnerId: string; status: EsignApplicationStatus; expiresAt?: string; rejectionReason?: string; reviewedBy?: string; submittedAt?: string; reviewedAt?: string; approvedAt?: string; createdBy?: string; updatedBy?: string; createdAt: string; updatedAt: string; }
export interface EsignApplicationFileEntity { id: string; tenantId: string; applicationId: string; fileId: string; status: EsignApplicationFileStatus; rejectionReason?: string; verifiedBy?: string; verifiedAt?: string; createdBy?: string; updatedBy?: string; createdAt: string; updatedAt: string; }
export interface SigningProcessEntity { id: string; tenantId: string; applicationId?: string; generatedDocumentId: string; status: SigningProcessStatus; sequential: boolean; snapshot: Record<string, unknown>; terminalSnapshot?: Record<string, unknown>; startedAt?: string; finishedAt?: string; createdBy?: string; updatedBy?: string; createdAt: string; updatedAt: string; }
export interface SigningParticipantEntity { id: string; tenantId: string; processId: string; participantType: SigningParticipantType; participantUserId: string; signOrder: number; status: SigningParticipantStatus; invitedAt?: string; viewedAt?: string; signedAt?: string; rejectedAt?: string; skippedAt?: string; expiresAt?: string; createdBy?: string; updatedBy?: string; createdAt: string; updatedAt: string; }
export interface SignatureEventEntity { id: string; tenantId: string; processId: string; participantId?: string; eventType: string; payload: Record<string, unknown>; createdAt: string; }
export interface LegalLogEntryEntity { id: string; tenantId: string; actorId?: string; entityType: string; entityId: string; eventType: string; description: string; payload: Record<string, unknown>; createdAt: string; }
