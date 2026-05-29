/**
 * Phase 3 Plan A — admin assessment surface types.
 * Поверхность: Question Banks / Questions / Tests / Assignments / Reviewer Queue.
 */

export type QuestionType = 'single_choice' | 'multiple_choice' | 'number_input' | 'text' | 'essay';

export type EntityStatus = 'active' | 'draft' | 'published' | 'archived';

/* ---------- Question Bank ---------- */

export interface QuestionBankListItem {
  id: string;
  tenantId: string;
  code?: string;
  title: string;
  description?: string;
  courseId?: string;
  isArchived: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBanksListFilters {
  q?: string;
  status?: EntityStatus;
  courseId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateQuestionBankPayload {
  title: string;
  description?: string;
  courseId?: string;
  code?: string;
}

export interface UpdateQuestionBankPayload {
  title?: string;
  description?: string;
  courseId?: string;
  code?: string;
  status?: EntityStatus;
}

/* ---------- Question + AnswerOption ---------- */

export interface AnswerOptionListItem {
  id: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface QuestionListItem {
  id: string;
  tenantId: string;
  questionBankId: string;
  type: QuestionType;
  title: string;
  body?: string;
  score: number;
  isArchived: boolean;
  status: EntityStatus;
  numericExpected?: number;
  numericTolerance?: number;
  expectedAnswer?: string;
  tags?: string[];
  answerOptions?: AnswerOptionListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionsForBankFilters {
  type?: QuestionType;
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AnswerOptionPayload {
  text: string;
  isCorrect: boolean;
  sortOrder?: number;
}

export interface CreateQuestionPayload {
  questionBankId: string;
  type: QuestionType;
  title?: string;
  body?: string;
  score?: number;
  answerOptions?: AnswerOptionPayload[];
  numericExpected?: number;
  numericTolerance?: number;
  expectedAnswer?: string;
  tags?: string[];
}

export interface UpdateQuestionPayload {
  type?: QuestionType;
  title?: string;
  body?: string;
  score?: number;
  answerOptions?: AnswerOptionPayload[];
  numericExpected?: number;
  numericTolerance?: number;
  expectedAnswer?: string;
  tags?: string[];
  status?: EntityStatus;
}

/* ---------- Test + Rule + TestQuestion ---------- */

export interface TestRuleSummary {
  attemptLimit: number;
  dailyResetEnabled: boolean;
  randomizeQuestions: boolean;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore: number;
}

export interface TestListItem {
  id: string;
  tenantId: string;
  courseId: string;
  title: string;
  description?: string;
  questionBankId?: string;
  rules: TestRuleSummary;
  isArchived: boolean;
  status: EntityStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestQuestionLink {
  id: string;
  testId: string;
  questionId: string;
  sortOrder: number;
}

export interface CreateTestPayload {
  courseId: string;
  title: string;
  description?: string;
  questionBankId?: string;
}

export interface UpdateTestPayload {
  title?: string;
  description?: string;
  status?: EntityStatus;
}

export interface UpdateTestRulePayload {
  attemptLimit?: number;
  randomizeQuestions?: boolean;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore?: number;
  dailyResetEnabled?: boolean;
}

export interface AddTestQuestionPayload {
  questionId: string;
  sortOrder?: number;
}

/* ---------- Assignment ---------- */

export interface AssignmentListItem {
  id: string;
  tenantId: string;
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  maxScore: number;
  isReviewRequired: boolean;
  isArchived: boolean;
  status: EntityStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentsListFilters {
  q?: string;
  status?: EntityStatus;
  courseId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateAssignmentPayload {
  courseId: string;
  title: string;
  moduleId?: string;
  description?: string;
  maxScore: number;
  isReviewRequired?: boolean;
}

export interface UpdateAssignmentPayload {
  title?: string;
  moduleId?: string;
  description?: string;
  maxScore?: number;
  isReviewRequired?: boolean;
}

/* ---------- Reviewer queue ---------- */

export interface ReviewerQueueListItem {
  kind: 'attempt' | 'submission';
  id: string;
  tenantId: string;
  learnerId: string;
  testId?: string;
  assignmentId?: string;
  submittedAt: string;
}

export interface ReviewerQueueResponse {
  pendingAttempts: ReviewerQueueListItem[];
  pendingSubmissions: ReviewerQueueListItem[];
}

/* ---------- List responses ---------- */

export interface PaginatedListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Form states ---------- */

export interface QuestionEditorFormState {
  type: QuestionType;
  title: string;
  body: string;
  score: number;
  answerOptions: Array<{ text: string; isCorrect: boolean }>;
  numericExpected: string;
  numericTolerance: string;
  expectedAnswer: string;
  tags: string;
}
