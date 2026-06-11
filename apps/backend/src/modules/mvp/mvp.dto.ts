import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

import type {
  CommissionMemberRole,
  FinalAssessmentForm,
  LearnerCategory,
  StudyForm,
  TrainingType
} from './mvp.types.js';

export interface BaseFilterQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  q?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
  /** ISO: зачисления с enrolled_at >= from (KPI и отчёты). */
  enrolled_from?: string;
  /** ISO: зачисления с enrolled_at <= to (конец дня, если только дата YYYY-MM-DD). */
  enrolled_to?: string;
  /** ISO: зачисления с planned_end_at >= from */
  planned_end_from?: string;
  /** ISO: зачисления с planned_end_at <= to */
  planned_end_to?: string;
  group_id?: string;
  learner_id?: string;
  course_id?: string;
  course_version_id?: string;
  module_id?: string;
  test_id?: string;
  enrollment_id?: string;
  assignment_id?: string;
  /** Если `1` или `true` — KPI snapshot включает `enrollmentBreakdown`. */
  include_enrollment_breakdown?: string;
}

export class CreateSimpleRegistryRequest {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  status?: string;

  /** Для записи learners: связь профиля с IAM user id (`JWT sub`). Игнорируется другими простыми справочниками. */
  @IsOptional()
  @IsString()
  linkedIamUserId?: string;

  /** Для записи learners: произвольный идентификатор орг-подразделения (сквозной ключ в рамках tenant). Игнорируется контрагентами/направлениями. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationUnitId?: string;
}

export class UpdateSimpleRegistryRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  linkedIamUserId?: string | null;

  /** Только для learners: код/ключ орг-подразделения. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(1)
  organizationUnitId?: string | null;
}

export class CreateCourseRequest {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCourseRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateModuleRequest {
  @IsString()
  @MinLength(1)
  courseVersionId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateModuleRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

const materialTypeValues = ['file', 'external_url', 'text', 'video'] as const;

export class CreateMaterialRequest {
  @IsString()
  @MinLength(1)
  moduleId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsIn(materialTypeValues)
  materialType!: (typeof materialTypeValues)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class UpdateMaterialRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsIn(materialTypeValues)
  materialType?: (typeof materialTypeValues)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class CreateGroupCourseRequest {
  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsString()
  @MinLength(1)
  courseId!: string;

  /** Дней на прохождение курса в программе; по умолчанию 90 при расчёте planned_end. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresPreExamAuth?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresIdentityVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresProctoring?: boolean;
}

export class UpdateGroupCourseRequest {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresPreExamAuth?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresIdentityVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresProctoring?: boolean;
}

export class CreateEnrollmentRequest {
  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;
}

const enrollmentStatusValues = [
  'pending',
  'active',
  'suspended',
  'completed',
  'cancelled'
] as const;

export class UpdateEnrollmentStatusRequest {
  @IsIn(enrollmentStatusValues)
  status!: (typeof enrollmentStatusValues)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}

const bulkDeliveryModes = ['immediate', 'queued'] as const;

export class CreateBulkEnrollmentsRequest {
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  /** Список слушателей; может быть дополнен выборкой по organizationUnitId. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learnerIds?: string[];

  /** Если задан — к списку learnerIds добавляются все слушатели этого подразделения (tenant-scoped). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationUnitId?: string;

  /** По умолчанию синхронное выполнение; `queued` — публикация в RabbitMQ и обработка в apps/worker. */
  @IsOptional()
  @IsIn(bulkDeliveryModes)
  deliveryMode?: (typeof bulkDeliveryModes)[number];
}

export class UpdateMaterialProgressRequest {
  /** Идентификатор зачисления MVP (может быть не UUID коротким id). Пустые / не строки отсекаются. */
  @IsDefined()
  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  studiedSeconds!: number;
}

export class CreateQuestionBankRequest {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  courseId?: string;
}

export class UpdateQuestionBankRequest {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export interface TestRulesDto {
  attemptLimit: number;
  dailyResetEnabled: boolean;
  randomizeQuestions: boolean;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore: number;
}

const questionTypeValues = [
  'single_choice',
  'multiple_choice',
  'number_input',
  'text',
  'essay'
] as const;

export class QuestionAnswerOptionDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class CreateQuestionRequest {
  @IsString()
  @MinLength(1)
  questionBankId!: string;

  @IsIn(questionTypeValues)
  type!: (typeof questionTypeValues)[number];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerOptionDto)
  answerOptions?: QuestionAnswerOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerOptionDto)
  options?: QuestionAnswerOptionDto[];

  // Phase 3 Plan A: number_input grading reference value.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numericExpected?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  numericTolerance?: number;

  // Phase 3 Plan A: short-answer text autograding reference.
  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  // Phase 3 Plan A: tags for filtering questions in admin UI (V1.1 categories surrogate).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateQuestionRequest {
  @IsOptional()
  @IsIn(questionTypeValues)
  type?: (typeof questionTypeValues)[number];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerOptionDto)
  answerOptions?: QuestionAnswerOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerOptionDto)
  options?: QuestionAnswerOptionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numericExpected?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  numericTolerance?: number;

  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Частичные правила теста (create / patch); совместимо с `normalizeTestRules`. */
export class TestRulesPartialDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attemptLimit?: number;

  @IsOptional()
  @IsBoolean()
  dailyResetEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  questionCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  timeLimitMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  passingScore?: number;
}

export class CreateTestRequest {
  @IsString()
  @MinLength(1)
  courseId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  moduleId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  questionBankId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TestRulesPartialDto)
  rules?: TestRulesPartialDto;
}

export class UpdateTestRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class PatchTestRulesRequest extends TestRulesPartialDto {}

export class StartAttemptRequest {
  @IsString()
  @MinLength(1)
  testId!: string;

  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;
}

/** Request a pre-exam identity verification link (Приказ №816). Same context as starting the attempt. */
export class RequestPreExamTokenRequest {
  @IsString()
  @MinLength(1)
  testId!: string;

  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;
}

/** Redeem a pre-exam identity link. */
export class VerifyPreExamTokenRequest {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class SaveAnswerRequest {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  answerOptionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;
}

export class SaveAttemptAnswerRequest {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;
}

export class CreateAssignmentRequest {
  @IsString()
  @MinLength(1)
  courseId!: string;

  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsBoolean()
  isReviewRequired?: boolean;
}

export class UpdateAssignmentRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isReviewRequired?: boolean;
}

export class CreateAssignmentSubmissionRequest {
  @IsString()
  @MinLength(1)
  assignmentId!: string;

  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsDefined()
  @IsString()
  @MinLength(1)
  learnerId!: string;

  @IsOptional()
  @IsString()
  textAnswer?: string;

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class UpdateAssignmentSubmissionRequest {
  @IsOptional()
  @IsString()
  textAnswer?: string;

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class CreateAssignmentReviewRequest {
  @IsString()
  @MinLength(1)
  submissionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

const assignmentReviewStatusValues = ['pending', 'in_review', 'completed'] as const;

export class UpdateAssignmentReviewRequest {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsIn(assignmentReviewStatusValues)
  reviewStatus?: (typeof assignmentReviewStatusValues)[number];
}

export class CompleteAssignmentReviewRequest {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class AddTestQuestionsRequest {
  @IsArray()
  @IsString({ each: true })
  questionIds!: string[];
}

export class ImportQuestionsRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionRequest)
  items!: CreateQuestionRequest[];
}

/** Тело `POST /answers`: попытка + поля ответа. */
export class CreateAnswerHttpRequest {
  @IsString()
  @MinLength(1)
  attemptId!: string;

  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  answerOptionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;
}

// === Pillar A — Plan A DTOs (§5.1, §5.2, §5.3) ===

const COMMISSION_MEMBER_ROLES = [
  'chairman',
  'deputy_chairman',
  'member',
  'secretary',
  'external_expert'
] as const satisfies readonly CommissionMemberRole[];

const TRAINING_TYPES = [
  'primary',
  'repeat',
  'target',
  'extraordinary'
] as const satisfies readonly TrainingType[];

const LEARNER_CATEGORIES = [
  'worker',
  'specialist',
  'manager',
  'mixed'
] as const satisfies readonly LearnerCategory[];

const STUDY_FORMS = ['in_person', 'distance', 'blended'] as const satisfies readonly StudyForm[];

const FINAL_ASSESSMENT_FORMS = [
  'test',
  'exam',
  'defense',
  'interview'
] as const satisfies readonly FinalAssessmentForm[];

/** `POST /commissions` — создание аттестационной комиссии. */
export class CreateCommissionRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

/** `PATCH /commissions/:id` — обновление name/description (code immutable). */
export class UpdateCommissionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

/**
 * `POST /commissions/:id/members` — добавить члена. Либо `userId` (внутренний),
 * либо `externalFullName` (внешний эксперт) — DB CHECK enforces, сервис проверит до insert.
 */
export class AddCommissionMemberRequest {
  @IsString()
  @IsIn(COMMISSION_MEMBER_ROLES)
  role!: CommissionMemberRole;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalFullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalPosition?: string;

  @IsOptional()
  @IsString()
  signatureFileId?: string;

  @IsInt()
  @Min(0)
  positionInOrder!: number;
}

/** `PATCH /course-versions/:id/program-meta` — patch программных полей черновика. */
export class UpdateProgramMetaRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  academicHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  recertificationPeriodMonths?: number;

  @IsOptional()
  @IsIn(TRAINING_TYPES)
  trainingType?: TrainingType;

  @IsOptional()
  @IsIn(LEARNER_CATEGORIES)
  learnerCategory?: LearnerCategory;

  @IsOptional()
  @IsIn(STUDY_FORMS)
  studyForm?: StudyForm;

  @IsOptional()
  @IsIn(FINAL_ASSESSMENT_FORMS)
  finalAssessmentForm?: FinalAssessmentForm;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  regulatoryBasisCodes?: string[];

  @IsOptional()
  @IsString()
  programAttachmentFileId?: string;

  @IsOptional()
  @IsString()
  commissionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otProgramCodes?: string[];
}

/** Одна строка пакета документов (внутри `PutCourseDocumentSetRequest.entries`). */
export class CourseDocumentSetEntryRequest {
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  autoIssueOnCompletion!: boolean;
}

/** `PUT /course-versions/:id/document-set` — replace-all семантика. */
export class PutCourseDocumentSetRequest {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CourseDocumentSetEntryRequest)
  entries!: CourseDocumentSetEntryRequest[];
}

// === Phase 3 Plan C — presigned upload / return / complete-review DTOs ===

/** `POST /assignment-submissions/:id/upload-url` */
export class CreateUploadUrlRequest {
  @IsString()
  @MinLength(1)
  originalName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sizeBytes!: number;
}

/** `POST /assignment-submissions/:id/return` */
export class ReturnSubmissionRequest {
  @IsOptional()
  @IsString()
  comment?: string;
}

/** Nested item inside `CompleteAttemptReviewRequest`. */
export class AttemptAnswerScore {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  score!: number;
}

/** `POST /attempts/:id/complete-review` */
export class CompleteAttemptReviewRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerScore)
  answerScores!: AttemptAnswerScore[];

  @IsOptional()
  @IsString()
  reviewComment?: string;
}

// === Phase 4 Plan A — identity verification DTOs ===

/** Phase 4 Plan A: start (or resume the draft of) a documentary identity verification. */
export class CreateIdentityVerificationRequest {
  /** Optional explicit learner (admin/act-as); defaults to the actor-linked learner. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  learnerId?: string;
}

/** Phase 4 Plan A: attach the uploaded files + 152-ФЗ consent; moves draft → pending. */
export class SubmitIdentityVerificationRequest {
  @IsString()
  @MinLength(1)
  selfieFileId!: string;

  @IsString()
  @MinLength(1)
  passportFileId!: string;

  @IsBoolean()
  @Equals(true)
  consent!: boolean;
}

/** Phase 4 Plan A: manual review decision. */
export class ReviewIdentityVerificationRequest {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MinLength(1)
  rejectionReason?: string;
}

// === Phase 4 Plan B — proctoring DTOs ===

/** `POST /proctoring-recordings` — start (or idempotently resume) a recording session. */
export class StartProctoringRecordingRequest {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  courseId!: string;

  /** 152-ФЗ: explicit consent to video recording. */
  @IsBoolean()
  @Equals(true)
  consent!: boolean;
}

/** `POST /proctoring-recordings/:id/chunk-upload-intent` — presigned PUT for one MediaRecorder chunk. */
export class CreateProctoringChunkUploadUrlRequest {
  /** 0-based monotonic chunk number assigned by the client. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence!: number;

  @IsString()
  @MinLength(1)
  originalName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sizeBytes!: number;
}

/** `PATCH /enrollments/:id/proctoring-override` — per-student switch; null = inherit group-course. */
export class SetProctoringOverrideRequest {
  @ValidateIf((_, value) => value !== null)
  @IsIn(['require', 'exempt'])
  override!: 'require' | 'exempt' | null;
}
