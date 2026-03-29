import type { EsignApplicationStatus, EsignApplicationFileStatus, SigningParticipantStatus, SigningParticipantType, SigningProcessStatus } from './esign.types.js';
export interface EsignBaseFilter { page?: number; pageSize?: number; search?: string; status?: string; learnerId?: string; processId?: string; eventType?: string; }
export interface CreateEsignApplicationRequest { learnerId: string; expiresAt?: string }
export interface UpdateEsignApplicationRequest { expiresAt?: string }
export interface RejectEsignApplicationRequest { reason: string }
export interface CreateEsignApplicationFileRequest { applicationId: string; fileId: string }
export interface RejectEsignApplicationFileRequest { reason: string }
export interface CreateSigningProcessRequest { idempotencyKey: string; generatedDocumentId: string; applicationId?: string; sequential?: boolean; snapshot?: Record<string, unknown>; }
export interface CreateSigningParticipantRequest { processId: string; participantType: SigningParticipantType; participantUserId: string; signOrder: number; }
export interface UpdateSigningParticipantRequest { signOrder?: number; expiresAt?: string }
export interface ParticipantActionRequest { idempotencyKey: string; payload?: Record<string, unknown> }
export interface EsignApplicationListItem { id: string; learnerId: string; status: EsignApplicationStatus; createdAt: string; updatedAt: string }
export interface EsignApplicationDetails extends EsignApplicationListItem { expiresAt?: string; rejectionReason?: string }
export interface EsignApplicationFileListItem { id: string; applicationId: string; fileId: string; status: EsignApplicationFileStatus; createdAt: string }
export interface SigningProcessListItem { id: string; generatedDocumentId: string; applicationId?: string; status: SigningProcessStatus; createdAt: string }
export interface SigningParticipantListItem { id: string; processId: string; participantType: SigningParticipantType; participantUserId: string; signOrder: number; status: SigningParticipantStatus }
