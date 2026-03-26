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
}

export type EnrollmentStatus = 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';

export interface Enrollment extends BaseEntity {
  groupId: string;
  learnerId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
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
  title: string;
  description?: string;
  courseId?: string;
  archivedAt?: string;
}

export interface Question extends BaseEntity {
  questionBankId: string;
  text: string;
  explanation?: string;
  type: QuestionType;
  maxScore: number;
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
  title: string;
  courseId: string;
  questionBankId?: string;
  publishedAt?: string;
  archivedAt?: string;
  rules: TestRule;
}

export type AttemptStatus = 'draft' | 'in_progress' | 'submitted' | 'finished' | 'expired' | 'invalidated';

export interface Attempt extends BaseEntity {
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
  maxScore?: number;
  passed?: boolean;
  questionOrder: string[];
}

export interface AttemptAnswer extends BaseEntity {
  attemptId: string;
  questionId: string;
  answerOptionIds?: string[];
  textAnswer?: string;
  score?: number;
}

export interface ExamResult extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptsCount: number;
  bestAttemptId?: string;
  bestScore: number;
  maxScore: number;
  passingScore: number;
  passed: boolean;
}

export interface Assignment extends BaseEntity {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  isReviewRequired: boolean;
  maxScore: number;
  publishedAt?: string;
  archivedAt?: string;
}

export type AssignmentSubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'reviewed' | 'returned' | 'rejected';
export interface AssignmentSubmission extends BaseEntity {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  textAnswer?: string;
  fileId?: string;
  submittedAt?: string;
  status: AssignmentSubmissionStatus;
}

export type AssignmentReviewStatus = 'pending' | 'in_review' | 'completed';
export interface AssignmentReview extends BaseEntity {
  assignmentId: string;
  submissionId: string;
  enrollmentId: string;
  reviewerId: string;
  score?: number;
  comment?: string;
  reviewStatus: AssignmentReviewStatus;
  completedAt?: string;
}
