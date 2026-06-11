export type IdentityVerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface IdentityVerificationDto {
  id: string;
  learnerId: string;
  method: 'selfie_passport';
  verificationStatus: IdentityVerificationStatus;
  selfieFileId?: string;
  passportFileId?: string;
  consentAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  imagesPurgedAt?: string;
  createdAt: string;
}

/** Admin queue row: record + learner display data for manual comparison. */
export interface IdentityVerificationView extends IdentityVerificationDto {
  learnerName: string;
  learnerSnils?: string;
  learnerDateOfBirth?: string;
}

/** Admin detail: + presigned image URLs (absent after purge / before upload). */
export interface IdentityVerificationDetail extends IdentityVerificationView {
  selfieUrl?: string;
  passportUrl?: string;
  /** Error code when the selfie file is unavailable (e.g. 'file_infected', 'file_scan_failed', 'file_not_found'). */
  selfieFileError?: string;
  /** Error code when the passport file is unavailable (e.g. 'file_infected', 'file_scan_failed', 'file_not_found'). */
  passportFileError?: string;
}

export interface CreateUploadUrlPayload {
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface SubmitIdentityVerificationPayload {
  selfieFileId: string;
  passportFileId: string;
  consent: true;
}

export interface ReviewIdentityVerificationPayload {
  decision: 'approve' | 'reject';
  rejectionReason?: string;
}
