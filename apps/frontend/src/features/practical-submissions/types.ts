export type SubmissionStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'reviewed'
  | 'returned'
  | 'rejected';

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
