import type {
  GeneratedBaseFilterQuery as BaseFilterQuery,
  GeneratedSessionDto as SessionDto
} from '@cdoprof/api-contracts/src/generated/contracts.generated';

export type { BaseFilterQuery, SessionDto };

/** Параметры `GET /reports/kpi-snapshot` (расширяет тип спискового фильтра). */
export type KpiFilterQuery = BaseFilterQuery & {
  created_from?: string;
  created_to?: string;
  /** `1` или `true` — в ответе появится `enrollmentBreakdown`. */
  include_enrollment_breakdown?: string;
};

export interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BaseEntity {
  id: string;
  tenantId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserEntity {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: 'active' | 'blocked';
  displayName: string;
}

export interface RoleEntity {
  id: string;
  tenantId: string;
  code: string;
  name: string;
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
  organizationUnitId?: string;
  linkedIamUserId?: string;
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

export interface CourseModule extends BaseEntity {
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
}

export interface Group extends BaseEntity {
  code: string;
  name: string;
}

export interface GroupCourse extends BaseEntity {
  groupId: string;
  courseId: string;
  courseVersionId?: string;
  sortOrder: number;
}

export interface Enrollment extends BaseEntity {
  groupId: string;
  learnerId: string;
  courseId?: string;
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  enrolledAt: string;
}

export interface Progress extends BaseEntity {
  enrollmentId: string;
  courseId: string;
  moduleId: string;
  materialId: string;
  progressPercent: number;
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface QuestionBank extends BaseEntity {
  code: string;
  title: string;
  description?: string;
  isArchived: boolean;
  courseId?: string;
}

export interface Question extends BaseEntity {
  questionBankId: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  title: string;
  body: string;
  score: number;
  isArchived: boolean;
}

export interface TestEntity extends BaseEntity {
  title: string;
  courseId: string;
  questionBankId?: string;
  description?: string;
  rules: {
    attemptLimit: number;
    dailyResetEnabled: boolean;
    randomizeQuestions: boolean;
    questionCount?: number;
    timeLimitMinutes?: number;
    passingScore: number;
  };
}

export interface Attempt extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptNo: number;
  status: string;
  score?: number;
  maxScore: number;
  passed?: boolean;
  questionOrder: string[];
  startedAt: string;
  expiresAt?: string;
}

export interface ExamResult extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  finalScore: number;
  maxScore: number;
  passed: boolean;
  attemptsCount: number;
}

export interface Assignment extends BaseEntity {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  isReviewRequired: boolean;
  maxScore: number;
  isArchived: boolean;
}

export interface AssignmentSubmission extends BaseEntity {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  answerText?: string;
  fileId?: string;
  status: string;
  submittedAt?: string;
}

export interface AssignmentReview extends BaseEntity {
  assignmentId: string;
  submissionId: string;
  enrollmentId: string;
  reviewerId: string;
  status: string;
  score?: number;
  comment?: string;
}

/** Ответ `GET /reports/kpi-snapshot` (BL-008). */
export interface KpiSnapshot {
  scope: {
    courseId?: string;
    groupId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  enrollmentCompletionRate: number;
  examResultsInScopeTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  enrollmentBreakdown?: Array<{
    enrollmentId: string;
    learnerId: string;
    groupId: string;
    status: string;
    enrolledAt: string;
  }>;
}

/** Ответ `POST /enrollments/bulk` (BL-003). */
export interface BulkEnrollmentsOutcome {
  idempotencyKey: string;
  groupId: string;
  created: Enrollment[];
  skippedExisting: Array<{ learnerId: string; enrollmentId: string }>;
  errors: Array<{ learnerId: string; code: string; message: string }>;
}

/** Если body содержит `deliveryMode: "queued"`. */
export interface BulkEnrollmentsQueuedResponse {
  status: 'queued';
  messageId: string;
  idempotencyKey: string;
}

export interface EnrollmentCertificateRow {
  id: string;
  documentType: string;
  name: string;
  /** Путь относительно origin backend, начинается с `/api/...` */
  downloadUrl: string;
}
