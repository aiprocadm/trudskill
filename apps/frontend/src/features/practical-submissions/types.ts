export type SubmissionStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'reviewed'
  | 'returned'
  | 'rejected';

/** V1.1 AV gate: stored antivirus status of an attached file. `pending` = not yet scanned. */
export type AntivirusStatus = 'pending' | 'clean' | 'infected' | 'error';

export interface LearnerAssignmentSummary {
  assignmentId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  learnerId: string;
  maxScore: number;
  submissionId?: string;
  status: SubmissionStatus;
  returnComment?: string;
}

export interface AssignmentSubmissionDto {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  answerText?: string;
  fileId?: string;
  status: SubmissionStatus;
  submittedAt?: string;
  returnComment?: string;
  /** V1.1 AV gate: antivirus status of the attached file; null/omitted when no file. */
  antivirusStatus?: AntivirusStatus | null;
}

export interface CreateSubmissionPayload {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  answerText?: string;
}

export interface UpdateSubmissionPayload {
  answerText?: string;
  fileId?: string;
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
