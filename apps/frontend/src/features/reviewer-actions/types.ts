import type { AntivirusStatus } from '../practical-submissions/types';

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
  /**
   * Имена вместо идентификаторов (ревизия 2026-08-25). Очередь отдавала только
   * идентификаторы, и преподаватель видел «Учащийся lrn_a3f9…» — то есть не знал, чью
   * работу проверяет. Поля необязательные: если справочник не нашёл запись, экран
   * покажет это словами, а не пустотой.
   */
  learnerName?: string;
  testTitle?: string;
  assignmentTitle?: string;
  /** Plan C: manual-grading payload — present only for attempt items with essay answers. */
  essayAnswers?: ReviewerQueueEssayAnswer[];
  /** V1.1 AV gate: attached submission file id (submission items only). */
  fileId?: string;
  /** V1.1 AV gate: antivirus status of the attached file; null/omitted when no file. */
  antivirusStatus?: AntivirusStatus | null;
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
