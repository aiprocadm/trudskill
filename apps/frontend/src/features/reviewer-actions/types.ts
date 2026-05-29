export interface ReviewerQueueEssayAnswer {
  questionId: string;
  questionTitle: string;
  answerText: string;
}

export interface ReviewerQueueItem {
  kind: 'attempt' | 'submission';
  id: string;
  tenantId: string;
  learnerId: string;
  testId?: string;
  assignmentId?: string;
  submittedAt: string;
  /** Plan C: manual-grading payload — present only for attempt items with essay answers. */
  essayAnswers?: ReviewerQueueEssayAnswer[];
}

export interface ReviewerQueueSnapshot {
  pendingAttempts: ReviewerQueueItem[];
  pendingSubmissions: ReviewerQueueItem[];
}

export interface CreateReviewPayload {
  submissionId: string;
  score?: number;
  comment?: string;
}

export interface CompleteReviewPayload {
  score?: number;
  comment?: string;
}

export interface ReturnSubmissionPayload {
  comment?: string;
}

export interface AttemptAnswerScore {
  questionId: string;
  score: number;
}

export interface CompleteAttemptReviewPayload {
  answerScores: AttemptAnswerScore[];
  reviewComment?: string;
}

export interface AssignmentReviewDto {
  id: string;
  submissionId: string;
  assignmentId: string;
  status: 'pending' | 'in_review' | 'completed';
  score?: number;
  comment?: string;
}
