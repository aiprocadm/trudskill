export enum EntityStatus {
  Active = 'active',
  Inactive = 'inactive',
  Archived = 'archived'
}

export enum UserStatus {
  Invited = 'invited',
  Active = 'active',
  Suspended = 'suspended',
  Deactivated = 'deactivated'
}

export enum EnrollmentStatus {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
  Canceled = 'canceled'
}

export enum CompletionStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed'
}

export enum AsyncTaskStatus {
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Canceled = 'canceled'
}

export enum DocumentStatus {
  Draft = 'draft',
  Generated = 'generated',
  Signed = 'signed',
  Archived = 'archived'
}

export enum SigningStatus {
  NotRequired = 'not_required',
  Pending = 'pending',
  Signed = 'signed',
  Rejected = 'rejected'
}

export enum ProctoringStatus {
  NotRequired = 'not_required',
  Scheduled = 'scheduled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Flagged = 'flagged'
}

export enum NotificationStatus {
  Pending = 'pending',
  Sent = 'sent',
  Delivered = 'delivered',
  Failed = 'failed'
}

export enum IntegrationTaskStatus {
  Pending = 'pending',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed'
}
