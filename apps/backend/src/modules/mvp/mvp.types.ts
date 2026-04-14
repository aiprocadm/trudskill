export type EntityStatus = string;

export interface BaseEntity {
  id: string;
  tenantId: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Counterparty extends BaseEntity {
  code: string;
  name: string;
  legalName?: string;
}

export interface Learner extends BaseEntity {
  learnerNo?: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface Direction extends BaseEntity {
  code: string;
  name: string;
}

export interface Course extends BaseEntity {
  code: string;
  title: string;
  description?: string;
  isArchived: boolean;
}

export interface CourseVersion extends BaseEntity {
  courseId: string;
  versionNo: number;
}

export interface CourseModuleEntity extends BaseEntity {
  courseVersionId: string;
  title: string;
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
}

export interface Material extends BaseEntity {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
  fileId?: string;
}

export interface GroupEntity extends BaseEntity {
  code: string;
  name: string;
}

export interface GroupCourse extends BaseEntity {
  groupId: string;
  courseId: string;
  courseVersionId?: string;
  sortOrder: number;
  /** Срок прохождения курса в рамках группы (дней от даты зачисления). */
  durationDays?: number;
}

export type EnrollmentStatus = 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';

export interface Enrollment extends BaseEntity {
  groupId: string;
  learnerId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
  /** Плановая дата окончания (по максимуму сроков курсов программы). */
  plannedEndAt?: string;
}

export interface EnrollmentStatusHistory {
  id: string;
  tenantId: string;
  enrollmentId: string;
  status: EnrollmentStatus;
  changedAt: string;
  reason?: string;
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface MaterialProgress extends BaseEntity {
  enrollmentId: string;
  courseId: string;
  moduleId: string;
  materialId: string;
  status: ProgressStatus;
  studiedSeconds: number;
  requiredSeconds: number;
  progressPercent: number;
  completedAt?: string;
  lastActivityAt?: string;
  calculatedAt?: string;
}

export interface ModuleProgress extends BaseEntity {
  enrollmentId: string;
  courseId: string;
  moduleId: string;
  status: ProgressStatus;
  studiedSeconds: number;
  requiredSeconds: number;
  progressPercent: number;
  completedAt?: string;
  lastActivityAt?: string;
  calculatedAt?: string;
}

export interface CourseProgress extends BaseEntity {
  enrollmentId: string;
  courseId: string;
  status: ProgressStatus;
  studiedSeconds: number;
  requiredSeconds: number;
  progressPercent: number;
  completedAt?: string;
  lastActivityAt?: string;
  calculatedAt?: string;
}

export type QuestionType = 'single_choice' | 'multiple_choice' | 'text';

export interface QuestionBank extends BaseEntity {
  code?: string;
  title: string;
  description?: string;
  courseId?: string;
  isArchived: boolean;
  archivedAt?: string;
}

export interface Question extends BaseEntity {
  questionBankId: string;
  type: QuestionType;
  title: string;
  body?: string;
  score: number;
  isArchived: boolean;
  text?: string;
  explanation?: string;
  maxScore?: number;
}

export interface AnswerOption extends BaseEntity {
  questionId: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface TestRule {
  attemptLimit: number;
  dailyResetEnabled: boolean;
  randomizeQuestions: boolean;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore: number;
}

export interface TestEntity extends BaseEntity {
  courseId: string;
  title: string;
  description?: string;
  questionBankId?: string;
  rules: TestRule;
  isArchived: boolean;
  publishedAt?: string;
  archivedAt?: string;
}

export interface TestQuestion extends BaseEntity {
  testId: string;
  questionId: string;
  sortOrder: number;
}

export type AttemptStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'finished'
  | 'expired'
  | 'invalidated';

export interface TestAttempt extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  score?: number;
  maxScore: number;
  passed?: boolean;
  questionOrder: string[];
}

export type Attempt = TestAttempt;

export interface AttemptAnswer extends BaseEntity {
  attemptId: string;
  questionId: string;
  answerOptionIds?: string[];
  selectedOptionIds?: string[];
  textAnswer?: string;
  score?: number;
}

export interface ExamResult extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptsCount: number;
  bestAttemptId?: string;
  bestScore?: number;
  finalScore?: number;
  maxScore: number;
  passingScore?: number;
  passed: boolean;
}

export interface Assignment extends BaseEntity {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  maxScore: number;
  isReviewRequired: boolean;
  isArchived: boolean;
  publishedAt?: string;
  archivedAt?: string;
}

export type AssignmentSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'reviewed'
  | 'returned'
  | 'rejected';

export interface AssignmentSubmission extends BaseEntity {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  textAnswer?: string;
  answerText?: string;
  fileId?: string;
  status: AssignmentSubmissionStatus;
  submittedAt?: string;
}

export type AssignmentReviewStatus = 'pending' | 'in_review' | 'completed';

export interface AssignmentReview extends BaseEntity {
  assignmentId: string;
  submissionId: string;
  enrollmentId: string;
  reviewerId: string;
  status: AssignmentReviewStatus;
  reviewStatus?: AssignmentReviewStatus;
  score?: number;
  comment?: string;
  completedAt?: string;
}
