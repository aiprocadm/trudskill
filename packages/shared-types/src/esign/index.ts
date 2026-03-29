export enum EsignApplicationStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  UnderReview = 'under_review',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
  Reused = 'reused'
}

export enum SigningProcessStatus {
  Draft = 'draft',
  Prepared = 'prepared',
  AwaitingParticipants = 'awaiting_participants',
  InSigning = 'in_signing',
  Signed = 'signed',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

export enum SigningParticipantStatus {
  Pending = 'pending',
  Invited = 'invited',
  Viewed = 'viewed',
  Signed = 'signed',
  Rejected = 'rejected',
  Skipped = 'skipped',
  Expired = 'expired'
}

export type SigningParticipantType = 'learner' | 'commission_member' | 'employee';
