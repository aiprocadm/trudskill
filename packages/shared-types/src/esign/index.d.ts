export declare enum EsignApplicationStatus {
    Draft = "draft",
    Submitted = "submitted",
    UnderReview = "under_review",
    Approved = "approved",
    Rejected = "rejected",
    Expired = "expired",
    Reused = "reused"
}
export declare enum EsignApplicationFileStatus {
    Uploaded = "uploaded",
    Verified = "verified",
    Rejected = "rejected"
}
export declare enum SigningProcessStatus {
    Draft = "draft",
    Prepared = "prepared",
    AwaitingParticipants = "awaiting_participants",
    InSigning = "in_signing",
    Signed = "signed",
    Failed = "failed",
    Cancelled = "cancelled"
}
export declare enum SigningParticipantStatus {
    Pending = "pending",
    Invited = "invited",
    Viewed = "viewed",
    Signed = "signed",
    Rejected = "rejected",
    Skipped = "skipped",
    Expired = "expired"
}
export type SigningParticipantType = 'learner' | 'commission_member' | 'employee';
export interface EsignBaseFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    learnerId?: string;
    processId?: string;
    eventType?: string;
}
export interface CreateEsignApplicationRequest {
    learnerId: string;
    expiresAt?: string;
}
export interface UpdateEsignApplicationRequest {
    expiresAt?: string;
}
export interface RejectEsignApplicationRequest {
    reason: string;
}
export interface CreateEsignApplicationFileRequest {
    applicationId: string;
    fileId: string;
}
export interface RejectEsignApplicationFileRequest {
    reason: string;
}
export interface CreateSigningProcessRequest {
    idempotencyKey: string;
    generatedDocumentId: string;
    applicationId?: string;
    sequential?: boolean;
    snapshot?: Record<string, unknown>;
}
export interface StartSigningProcessRequest {
    idempotencyKey: string;
}
export interface CreateSigningParticipantRequest {
    processId: string;
    participantType: SigningParticipantType;
    participantUserId: string;
    signOrder: number;
}
export interface UpdateSigningParticipantRequest {
    signOrder?: number;
    expiresAt?: string;
}
export interface ParticipantActionRequest {
    idempotencyKey: string;
    payload?: Record<string, unknown>;
}
export interface EsignApplicationListItem {
    id: string;
    learnerId: string;
    status: EsignApplicationStatus;
    createdAt: string;
    updatedAt: string;
}
export interface EsignApplicationDetails extends EsignApplicationListItem {
    expiresAt?: string;
    rejectionReason?: string;
}
export interface EsignApplicationFileListItem {
    id: string;
    applicationId: string;
    fileId: string;
    status: EsignApplicationFileStatus;
    createdAt: string;
}
export interface SigningProcessListItem {
    id: string;
    generatedDocumentId: string;
    applicationId?: string;
    status: SigningProcessStatus;
    createdAt: string;
}
export interface SigningProcessStatusView {
    id: string;
    status: SigningProcessStatus;
    startedAt?: string;
    finishedAt?: string;
}
export interface SigningParticipantListItem {
    id: string;
    processId: string;
    participantType: SigningParticipantType;
    participantUserId: string;
    signOrder: number;
    status: SigningParticipantStatus;
}
export interface SignatureEventListItem {
    id: string;
    processId: string;
    participantId?: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
}
export interface LegalLogEntryListItem {
    id: string;
    actorId?: string;
    entityType: string;
    entityId: string;
    eventType: string;
    description: string;
    createdAt: string;
}
export interface LegalLogEntryDetails extends LegalLogEntryListItem {
    payload: Record<string, unknown>;
}
export interface ReuseCheckResponse {
    reusable: boolean;
    application: EsignApplicationDetails;
}
export interface EsignLookupItem {
    id: string;
    label: string;
    status: string;
}
//# sourceMappingURL=index.d.ts.map