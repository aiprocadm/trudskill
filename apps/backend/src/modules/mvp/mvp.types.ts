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
  /** Wave 2 ФРДО — дата рождения слушателя (ISO YYYY-MM-DD); нужна для выгрузки в ФИС ФРДО. */
  dateOfBirth?: string;
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
  materialType: 'file' | 'external_url' | 'text' | 'video' | 'scorm';
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
  fileId?: string;
  /** Phase 9 Plan A: пакет для materialType='scorm' (FK learning.scorm_packages, статус ready). */
  scormPackageId?: string;
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
  /** Wave 1 Plan 2 (Приказ №816): require identity verification before the final exam. */
  requiresPreExamAuth?: boolean;
  /** Phase 4 Plan A: require documentary identity verification (selfie+passport) before the final exam. */
  requiresIdentityVerification?: boolean;
  /** Phase 4 Plan B: record the final exam on webcam video (proctoring). */
  requiresProctoring?: boolean;
}

export type EnrollmentStatus = 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';

/** Phase 4 Plan B: per-student proctoring override ('require'/'exempt'); undefined inherits the group-course flag. */
export type ProctoringOverride = 'require' | 'exempt';

export interface Enrollment extends BaseEntity {
  groupId: string;
  learnerId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
  /** Плановая дата окончания (по максимуму сроков курсов программы). */
  plannedEndAt?: string;
  /** Phase 4 Plan B: per-student proctoring override; undefined inherits GroupCourse.requiresProctoring. */
  proctoringOverride?: ProctoringOverride;
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

/** Phase 9 Plan B — строка разбивки дашборда по курсу или группе. */
export interface AnalyticsBreakdownRow {
  /** courseId (для byCourse) или groupId (для byGroup). */
  key: string;
  /** Название курса / группы (или key, если сущность не найдена). */
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  /** 0..1 */
  completionRate: number;
  /** 0..1 */
  examPassRate: number;
  /** 0..1, либо null если нет оценённых экзаменов в строке. */
  averageScorePercent: number | null;
}

/** Phase 9 Plan B — распределение «с какой попытки сдан экзамен». */
export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

/** Phase 9 Plan B — сводка дашборда аналитики администратора. */
export interface AnalyticsDashboardDto {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  /** 0..1 */
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  /** 0..1 */
  examPassRate: number;
  /** Средний срок прохождения (дни, enrolledAt→completedAt) по завершённым; null если завершённых нет. */
  averageCompletionDays: number | null;
  /** Средний балл как доля от максимума (0..1); null если нет оценённых экзаменов. */
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  /** Активные зачисления без активности дольше порога. */
  dropOffCount: number;
  /** Порог неактивности в днях (эхо для UI). */
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}

/** Phase 10 Track A — сохранённый шаблон конструктора отчётов (MVP-state JSON-снимок, без миграции). */
export interface ReportTemplate extends BaseEntity {
  name: string;
  entityKey: 'learners' | 'enrollments';
  selectedFields: string[];
  filters: { key: string; value: string }[];
  createdBy?: string;
}

/** Phase 10 Track A — превью отчёта (строки капнуты для UI). */
export interface ReportPreviewDto {
  columns: { key: string; header: string; type: 'string' | 'number' | 'date' | 'enum' }[];
  rows: Record<string, string | number | null>[];
  /** Полное число подходящих строк до капа. */
  total: number;
  /** true, если строки были капнуты (total > отданных строк). */
  truncated: boolean;
}

/** Phase 10 Track A — XLSX-экспорт, base64-в-конверте (без S3/presigned). */
export interface ReportExportDto {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

/** Phase 10 Track A — метаданные реестра сущностей/полей/фильтров для UI. */
export interface ReportEntitiesMetaDto {
  entities: {
    key: string;
    label: string;
    fields: { key: string; header: string; type: string }[];
    filters: { key: string; label: string; kind: string; type: string }[];
  }[];
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
  /** V1.1 AV gate: attached submission file (submission items only) — drives the status lookup. */
  fileId?: string;
  /** V1.1 AV gate: antivirus status of the attached file ('pending'|'clean'|'infected'|'error'); null when no file. */
  antivirusStatus?: string | null;
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
  /** Wave 1: when set, this test is the intermediate (gating) test of the module. Null ⇒ final/course exam. */
  moduleId?: string;
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
  /** Wave 1 Plan 2: when identity was verified (Приказ №816) before this attempt. */
  identityVerifiedAt?: string;
  /** The consumed PreExamToken.id that proved identity for this attempt. */
  identityVerificationTokenId?: string;
}

export type Attempt = TestAttempt;

/**
 * Wave 1 Plan 2 (Приказ №816): single-use identity token e-mailed to the learner
 * before a final exam. Hash-only storage; a token with `consumedAt` set is the
 * verification record for its `(enrollmentId, testId)`.
 */
export interface PreExamToken extends BaseEntity {
  enrollmentId: string;
  testId: string;
  learnerId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  verifiedByActorId?: string;
}

export type IdentityVerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/**
 * Phase 4 Plan A: documentary identity verification (selfie + passport, manual review).
 * Keyed per-LEARNER — one approved record unlocks all of that learner's identity-gated
 * final exams. `verificationStatus` is the domain state machine (BaseEntity.status stays
 * the lifecycle 'active'). The decision persists after the retention cron purges images.
 */
export interface IdentityVerification extends BaseEntity {
  learnerId: string;
  method: 'selfie_passport';
  verificationStatus: IdentityVerificationStatus;
  selfieFileId?: string;
  passportFileId?: string;
  consentAt?: string;
  submittedAt?: string;
  reviewedByActorId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  /** Unused in pilot (indefinite validity); kept for a later validity window. */
  validUntil?: string;
  /** Set by the retention cron when selfie/passport objects were deleted. */
  imagesPurgedAt?: string;
}

/** Admin queue view: record + learner display data for manual comparison. */
export interface IdentityVerificationView extends IdentityVerification {
  learnerName: string;
  learnerSnils?: string;
  learnerDateOfBirth?: string;
}

export type ProctoringRecordingStatus = 'recording' | 'completed';

/** One uploaded (or at least intent-issued) MediaRecorder chunk; the file lives in storage.files. */
export interface ProctoringChunk {
  /** 0-based, monotonically assigned by the client. Gaps = skipped uploads (admin sees them). */
  sequence: number;
  fileId: string;
  uploadedIntentAt: string;
}

/**
 * Phase 4 Plan B: webcam recording session of a final exam, keyed per (learner, group, course).
 * `recordingStatus` is the domain state machine (BaseEntity.status stays the lifecycle 'active').
 * Abandoned sessions (browser crash) remain 'recording' — the retention cron ages them out
 * from `completedAt ?? startedAt`. Metadata persists after the cron purges chunk files.
 */
export interface ProctoringRecording extends BaseEntity {
  learnerId: string;
  groupId: string;
  courseId: string;
  recordingStatus: ProctoringRecordingStatus;
  /** Linked by startAttempt when the gated attempt actually starts. */
  attemptId?: string;
  /** 152-ФЗ consent timestamp (consent: true is required to create the session). */
  consentAt: string;
  startedAt: string;
  completedAt?: string;
  chunks: ProctoringChunk[];
  /** Set by the video retention cron when all chunk files were deleted. */
  purgedAt?: string;
}

/** Admin queue view: session + display enrichment. */
export interface ProctoringRecordingView extends ProctoringRecording {
  learnerName: string;
  courseTitle: string;
  attemptStatus?: AttemptStatus;
}

/** A chunk excluded from playback (AV verdict) or absent from the sequence entirely. */
export interface ProctoringChunkIssue {
  sequence: number;
  code: 'file_infected' | 'file_scan_failed' | 'file_error' | 'missing_chunk';
}

/** One playable chunk: short-lived presigned GET url, ordered by sequence. */
export interface ProctoringPlaybackChunk {
  sequence: number;
  fileId: string;
  url: string;
}

/** Admin detail: ordered presigned GET urls of clean chunks + issues (infected / gaps). */
export interface ProctoringRecordingDetail extends ProctoringRecordingView {
  playbackChunks: ProctoringPlaybackChunk[];
  chunkIssues: ProctoringChunkIssue[];
}

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
  returnComment?: string; // Plan C: reviewer feedback when returned for revision
}

export interface LearnerAssignmentSummary {
  assignmentId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  learnerId: string;
  maxScore: number;
  submissionId?: string;
  /** 'not_started' when no submission exists yet; otherwise mirrors the submission status. */
  status: 'not_started' | AssignmentSubmissionStatus;
  returnComment?: string;
}

export interface ReturnSubmissionInput {
  comment?: string;
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
  /** Коды программ ОТ-реестра (lookup.ot_training_programs.code); комплексный курс = несколько. */
  otProgramCodes?: string[];
  /** Phase 5B — срок действия удостоверения, мес. NULL/undefined = бессрочно. */
  recertificationPeriodMonths?: number;
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

// === ОТ-реестр (Минтруд/ЕИСОТ) ===

export interface OtTrainingProgram {
  code: string;
  registryId: number;
  exactName: string;
  programKind: 'A' | 'B' | 'V' | 'first_aid' | 'siz' | 'other';
  isActive: boolean;
}

export interface OtRegistryRow {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  snils: string;
  position: string;
  employerInn: string;
  programCode: string;
  programRegistryId: number;
  programName: string;
  protocolNumber: string;
  knowledgeCheckDate: string; // ДД.ММ.ГГГГ
  result: 'удовлетворительно' | 'неудовлетворительно';
}

export interface OtRegistryRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type OtRegistryBatchStatus = 'generated' | 'partial' | 'failed';

export interface OtRegistryBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: OtRegistryBatchStatus;
  generatedBy: string;
  /** PROVISIONAL формат сгенерированного файла. Отсутствует у старых батчей → трактуется как 'xlsx'. */
  format?: 'xlsx' | 'xml';
}

export interface OtRegistryRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  programCode: string;
  programRegistryId: number;
  protocolNumber: string;
  registrationNumber?: string;
}

export interface OtRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: OtRegistryRow[];
  errors: OtRegistryRowError[];
}

export interface OtRegistryResponseRow {
  snils: string;
  protocolNumber: string;
  programRegistryId: number;
  registrationNumber: string;
}

export interface OtRegistryImportOutcome {
  matched: number;
  unmatched: number;
  unmatchedRows: OtRegistryResponseRow[];
}

// === ФИС ФРДО (Рособрнадзор) — выгрузка по выданным документам ===

export interface FrdoDocumentKind {
  code: string; // 'PK' | 'PP'
  templateType: 'certificate' | 'diploma';
  frdoKind: string;
  educationLevel: string; // 'ДПО'
  exactName: string;
  isActive: boolean;
}

export interface FrdoRegistryRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string; // 'PK' | 'PP'
  documentKind: string; // exactName
  registrationNumber: string; // = GeneratedDocument.documentNumber
  issueDate: string; // ДД.ММ.ГГГГ
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  dateOfBirth: string; // ДД.ММ.ГГГГ | ''
  programName: string;
  academicHours: string; // число строкой | ''
  qualification: string; // '' (provisional)
}

export interface FrdoRegistryRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type FrdoRegistryBatchStatus = 'generated' | 'partial' | 'failed';

export interface FrdoRegistryBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: FrdoRegistryBatchStatus;
  generatedBy: string;
}

export interface FrdoRegistryRecord extends BaseEntity {
  batchId: string;
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string;
  registrationNumber: string;
  snils: string;
}

export interface FrdoRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: FrdoRegistryRow[];
  errors: FrdoRegistryRowError[];
}

// === ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ) — ростер по фильтру ===

export interface EisotTestingRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  dateOfBirth: string; // ДД.ММ.ГГГГ | ''
  position: string;
  employerName: string;
  employerInn: string;
  programName: string;
  referralDate: string; // ДД.ММ.ГГГГ | '' (enrolledAt)
}

export interface EisotTestingRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type EisotTestingBatchStatus = 'generated' | 'partial' | 'failed';

export interface EisotTestingBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: EisotTestingBatchStatus;
  generatedBy: string;
}

export interface EisotTestingRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  employerInn: string;
}

export interface EisotTestingExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: EisotTestingRow[];
  errors: EisotTestingRowError[];
}

// === Ростехнадзор (аттестация по промышленной безопасности) — Phase 6 ===
// PROVISIONAL: формат не сверен с эталоном Ростехнадзора. `attestationArea` —
// swap-point (пока = наименование программы/курса; при наличии офиц. классификатора
// областей аттестации заменить источник + добавить fan-out по областям).

export interface RostechnadzorRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  position: string;
  employerName: string;
  employerInn: string;
  attestationArea: string; // SWAP-POINT — провизорно = наименование программы
  protocolNumber: string;
  knowledgeCheckDate: string; // ДД.ММ.ГГГГ
  result: string; // 'удовлетворительно' (выгружаются только сданные)
}

export interface RostechnadzorRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type RostechnadzorBatchStatus = 'generated' | 'partial' | 'failed';

export interface RostechnadzorBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: RostechnadzorBatchStatus;
  generatedBy: string;
}

export interface RostechnadzorRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  protocolNumber: string;
}

export interface RostechnadzorExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: RostechnadzorRow[];
  errors: RostechnadzorRowError[];
}

// === Минздрав-НМО (непрерывное медобразование, ЗЕТ) — Phase 6 ===
// PROVISIONAL: формат не сверен с эталоном портала НМО (edu.rosminzdrav.ru).
// `specialty` и `creditUnits` (ЗЕТ) — swap-points (специальность пока пустая;
// ЗЕТ провизорно = академические часы программы).

export interface NmoRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  specialty: string; // SWAP-POINT — специальность (пока '')
  programName: string;
  creditUnits: string; // ЗЕТ — SWAP-POINT, провизорно = акад. часы; число строкой | ''
  completionDate: string; // ДД.ММ.ГГГГ
  documentNumber: string;
}

export interface NmoRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type NmoBatchStatus = 'generated' | 'partial' | 'failed';

export interface NmoBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: NmoBatchStatus;
  generatedBy: string;
}

export interface NmoRecord extends BaseEntity {
  batchId: string;
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  documentNumber: string;
}

export interface NmoExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: NmoRow[];
  errors: NmoRowError[];
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

// ─── Phase 9 Plan A: SCORM 1.2 import + player ───

export type ScormPackageStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

/** Загруженный SCORM 1.2 пакет: zip в storage.files, распакованный контент в S3 под storagePrefix. */
export interface ScormPackage extends BaseEntity {
  title: string;
  packageStatus: ScormPackageStatus;
  zipFileId: string;
  /** Детерминированный префикс: scorm/<tenantId>/<id> — content-роут вычисляет его без чтения state. */
  storagePrefix: string;
  launchHref?: string;
  manifestTitle?: string;
  entryCount?: number;
  totalBytes?: number;
  /** Код причины failed (scorm_version_unsupported | scorm_manifest_missing | ...). */
  error?: string;
}

export type ScormLessonStatus =
  | 'not attempted'
  | 'incomplete'
  | 'completed'
  | 'passed'
  | 'failed'
  | 'browsed';

/** cmi-прогресс SCORM per (enrollment, material): единственная запись, last-write-wins. */
export interface ScormAttempt extends BaseEntity {
  enrollmentId: string;
  materialId: string;
  learnerId: string;
  lessonStatus: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  /** Сумма session_time коммитов, секунды. */
  totalSeconds: number;
  startedAt: string;
  lastCommitAt?: string;
  completedAt?: string;
}

// ─── Phase 10 Track C: Web Push subscriptions ───

/** Браузерная push-подписка одного устройства пользователя (PushSubscription.toJSON()). */
export interface PushSubscription extends BaseEntity {
  userId: string;
  /** Уникальный endpoint push-сервиса браузера — ключ дедупликации per (tenant, endpoint). */
  endpoint: string;
  /** p256dh-ключ из subscription.keys. */
  p256dh: string;
  /** auth-ключ из subscription.keys. */
  auth: string;
  /** UA для диагностики/отзыва устройства (опционально). */
  userAgent?: string;
}
