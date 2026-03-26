export interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BaseFilterQuery {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  sort?: string;
  direction_id?: string;
  course_id?: string;
  course_version_id?: string;
  module_id?: string;
  group_id?: string;
  learner_id?: string;
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
  title: string;
  description?: string;
  courseId?: string;
}

export interface TestEntity extends BaseEntity {
  title: string;
  courseId: string;
  questionBankId?: string;
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
  status: string;
  questionOrder: string[];
  startedAt: string;
  expiresAt?: string;
}

export interface ExamResult extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptsCount: number;
  bestScore: number;
  passingScore: number;
  passed: boolean;
}

export interface Assignment extends BaseEntity {
  courseId: string;
  title: string;
  isReviewRequired: boolean;
  maxScore: number;
}
