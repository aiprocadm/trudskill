export type AttemptQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'number_input'
  | 'text'
  | 'essay';

export interface AttemptQuestionOption {
  id: string;
  text: string;
  sortOrder: number;
}

export interface AttemptQuestion {
  id: string;
  type: AttemptQuestionType;
  title: string;
  body?: string;
  score: number;
  options: AttemptQuestionOption[];
  /** Previously-saved answer echoed back by the answer-safe projection (for resume). */
  selectedOptionIds?: string[];
  textAnswer?: string;
}

export interface AttemptDto {
  id: string;
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  expiresAt?: string;
  score?: number;
  maxScore: number;
  passed?: boolean;
  questionOrder: string[];
}

export interface ExamResultDto {
  id: string;
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptsCount: number;
  finalScore?: number;
  maxScore: number;
  passed: boolean;
}

export interface LearnerTestSummary {
  testId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  learnerId: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'passed' | 'failed';
  attemptsUsed: number;
  attemptLimit: number;
  /** id of the resumable (draft/in_progress) attempt, if one exists. */
  activeAttemptId?: string;
  bestScore?: number;
  maxScore: number;
}

export interface StartAttemptPayload {
  testId: string;
  enrollmentId: string;
  learnerId: string;
}

export interface SaveAnswerPayload {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}

/** Local-only draft state keyed by questionId (not sent verbatim). */
export type AnswerDraftMap = Record<string, { selectedOptionIds?: string[]; textAnswer?: string }>;
