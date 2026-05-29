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
  /** Phase 2 Plan C — ИНН (10 или 12 цифр, валидируется DTO + DB CHECK). */
  inn?: string;
  /** Phase 2 Plan C — КПП (9 знаков, валидируется DTO). */
  kpp?: string;
  /** Phase 2 Plan C — основной контактный email клиента. */
  contactEmail?: string;
  /** Phase 2 Plan C — основной контактный телефон. */
  contactPhone?: string;
  /** Phase 2 Plan C — юридический адрес. */
  legalAddress?: string;
  /** Phase 2 Plan C — заметка для админа (не показывается клиенту). */
  note?: string;
}

export interface Learner extends BaseEntity {
  learnerNo?: string;
  firstName: string;
  lastName: string;
  /** Pillar A Plan C §5.11 — отчество для построения ФИО в шаблонах документов. */
  middleName?: string;
  email?: string;
  /** Произвольный ключ подразделения в рамках tenant (BL-003: массовые назначения по org unit). */
  organizationUnitId?: string;
  /** Если задан — мутации прогресса/субмиссий/попыток в контексте этого слушателя разрешены только этому IAM-пользователю (антивор IDOR). */
  linkedIamUserId?: string;
  /** Pillar A Plan C §5.11 — СНИЛС (формат XXX-XXX-XXX YY). */
  snils?: string;
  /** Pillar A Plan C §5.11 — должность ученика (для протоколов, удостоверений). */
  position?: string;
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

export interface CourseVersion extends BaseEntity, ProgramMeta {
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
  /** Phase 2 Plan C — опциональная привязка группы к компании-заказчику (FK на crm.counterparties). */
  counterpartyId?: string;
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

/** Результат одной операции массового назначения (`POST /enrollments/bulk`). */
export interface BulkEnrollmentItemError {
  learnerId: string;
  code: string;
  message: string;
}

export interface BulkEnrollmentsOutcome {
  groupId: string;
  /** Ключ клиентской идемпотентности (дубликат операции вернёт тот же снимок). */
  idempotencyKey: string;
  created: Enrollment[];
  skippedExisting: Array<{ learnerId: string; enrollmentId: string }>;
  errors: BulkEnrollmentItemError[];
}

/** Персист в коллекции `bulkEnrollmentIdempotency` MVP snapshot. */
export interface BulkEnrollmentIdempotencyRecord {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  outcome: BulkEnrollmentsOutcome;
  createdAt: string;
}

/** Сводка KPI обучения (BL-008). */
export interface KpiSnapshotDto {
  scope: {
    courseId?: string;
    groupId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  /** 0..1 */
  enrollmentCompletionRate: number;
  examResultsInScopeTotal: number;
  examResultsPassed: number;
  /** 0..1 */
  examPassRate: number;
  /** При `include_enrollment_breakdown=1` — построчный drill-down по зачислениям в фильтре. */
  enrollmentBreakdown?: Array<{
    enrollmentId: string;
    learnerId: string;
    groupId: string;
    status: EnrollmentStatus;
    enrolledAt: string;
  }>;
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

export type QuestionType = 'single_choice' | 'multiple_choice' | 'number_input' | 'text' | 'essay';

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
  numericExpected?: number;
  numericTolerance?: number;
  expectedAnswer?: string;
  tags?: string[];
}

export interface ReviewerQueueItem {
  kind: 'attempt' | 'submission';
  id: string;
  tenantId: string;
  learnerId: string;
  testId?: string;
  assignmentId?: string;
  submittedAt: string;
}

export interface ReviewerQueueSnapshot {
  pendingAttempts: ReviewerQueueItem[];
  pendingSubmissions: ReviewerQueueItem[];
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
  reviewComment?: string; // Plan C: reviewer note from manual essay grading
  reviewedBy?: string; // Plan C: actorId who completed the manual review
}

export type Attempt = TestAttempt;

export interface AttemptAnswer extends BaseEntity {
  attemptId: string;
  questionId: string;
  answerOptionIds?: string[];
  selectedOptionIds?: string[];
  textAnswer?: string;
  score?: number;
  autoGraded?: boolean;
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

export interface AttemptAnswerScoreInput {
  questionId: string;
  score: number;
}

export interface CompleteAttemptReviewInput {
  answerScores: AttemptAnswerScoreInput[];
  reviewComment?: string;
}

/**
 * Answer-safe projection of a question for the learner test player.
 * Deliberately omits every answer-key field (isCorrect / numericExpected /
 * numericTolerance / expectedAnswer / explanation) so the shape itself
 * guarantees no leak — see getAttemptQuestions.
 */
export interface AttemptQuestionOptionView {
  id: string;
  text: string;
  sortOrder: number;
}

export interface AttemptQuestionView {
  id: string;
  type: QuestionType;
  title: string;
  body?: string;
  score: number;
  options: AttemptQuestionOptionView[];
  selectedOptionIds?: string[];
  textAnswer?: string;
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

// === Pillar A — Plan A types (§5.1, §5.2, §5.3) ===

export type CommissionStatus = 'active' | 'archived';

/** Аттестационная комиссия. status наследуется из BaseEntity, значения active/archived. */
export interface Commission extends BaseEntity {
  code: string;
  name: string;
  description?: string;
}

export type CommissionMemberRole =
  | 'chairman'
  | 'deputy_chairman'
  | 'member'
  | 'secretary'
  | 'external_expert';

/**
 * Член комиссии. Либо userId (внутренний IAM-пользователь), либо externalFullName
 * (внешний эксперт). Domain treats как append-only: добавили/удалили, без update.
 */
export interface CommissionMember {
  id: string;
  tenantId: string;
  commissionId: string;
  role: CommissionMemberRole;
  userId?: string;
  externalFullName?: string;
  externalPosition?: string;
  signatureFileId?: string;
  positionInOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type TrainingType = 'primary' | 'repeat' | 'target' | 'extraordinary';
export type LearnerCategory = 'worker' | 'specialist' | 'manager' | 'mixed';
export type StudyForm = 'in_person' | 'distance' | 'blended';
export type FinalAssessmentForm = 'test' | 'exam' | 'defense' | 'interview';

/**
 * Регуляторная мета программы — поля на course_versions из §5.1 спеки.
 * Опциональны на черновике, обязательны для публикации (валидируется в publishCourseVersion).
 */
export interface ProgramMeta {
  academicHours?: number;
  trainingType?: TrainingType;
  learnerCategory?: LearnerCategory;
  studyForm?: StudyForm;
  finalAssessmentForm?: FinalAssessmentForm;
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string;
  commissionId?: string;
}

/** Global lookup из lookup.regulatory_acts. Не tenant-scoped, неизменяемый каталог. */
export interface RegulatoryAct {
  code: string;
  shortName: string;
  fullName: string;
  issuingAuthority: string;
  issuedAt?: string;
  url?: string;
  appliesToVerticals: string[];
  isActive: boolean;
  createdAt: string;
}

/** Запись в пакете выходных документов курса (§5.3). PUT-семантика: replace all on save. */
export interface CourseDocumentSetEntry {
  id: string;
  tenantId: string;
  courseVersionId: string;
  templateId: string;
  position: number;
  isRequired: boolean;
  autoIssueOnCompletion: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Re-exported from documents module — single source of truth for template_type and category_code unions. */
export type { TemplateType, VariableCategoryCode } from '../documents/documents.types.js';
