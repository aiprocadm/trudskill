import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

import { CourseDetailsRequest } from './courses/course-details.js';

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
  /**
   * Вид записи: у вопроса банка — «один из списка», «свободный ответ» и т. д.
   *
   * Отбор по нему давно предлагался человеку на двух экранах и уходил в адрес запроса, а
   * читать его было некому: список возвращался целиком (журнал 390).
   */
  type?: string;
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
  /** МГ-E1.1: курсы одного направления (фильтр списка курсов). */
  direction_id?: string;
  course_version_id?: string;
  /** Phase 9 Plan B — фильтр по компании-заказчику (group.counterpartyId); в реестре слушателей — компания-работодатель. */
  client_id?: string;
  /** Реестр слушателей (МГ-C3.2): «без почты» и «ни одного входа» — «1»/«true». */
  no_email?: string;
  never_logged_in?: string;
  /** Реестр групп (МГ-B3.2): быстрый отбор, ответственный, периоды дат, показ архива. */
  quick?: string;
  responsible_id?: string;
  start_from?: string;
  start_to?: string;
  end_from?: string;
  end_to?: string;
  exam_from?: string;
  exam_to?: string;
  include_archived?: string;
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

export class CreateCourseRequest extends CourseDetailsRequest {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** МГ-E1.1 (срез 15.1): направление курса — его и шлёт мастер курса. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  directionId?: string;
}

export class UpdateCourseRequest extends CourseDetailsRequest {
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

  /** МГ-E1.1: направление курса; `null` — убрать из направления. */
  @IsOptional()
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsString()
  @MinLength(1)
  directionId?: string | null;
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

/**
 * Порядок пунктов программы задаётся СПИСКОМ ЦЕЛИКОМ (ТЗ 8.4).
 *
 * Не «подними этот на одну позицию»: сдвиг не идемпотентен, и повторный запрос после обрыва
 * связи сдвинул бы ещё раз. Список целиком — заявление «вот как должно быть».
 *
 * Потолок в тысячу пунктов — защита от запроса, который присылают не глазами, а скриптом:
 * программ такого размера не бывает, а разбор списка на сто тысяч строк занял бы процесс.
 */
export class ReorderProgramRequest {
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  ids!: string[];
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

const materialTypeValues = ['file', 'external_url', 'text', 'video', 'scorm'] as const;

/**
 * Потолок длины текстового материала (ТЗ 2.5.a).
 *
 * **Настройка, а не константа** — правило ТЗ: всё, что выглядит как лимит, задаётся настройкой
 * со значением по умолчанию. Двести тысяч знаков — это примерно сто страниц: больше одного
 * учебного текста, но заведомо меньше того, что стоит слать одним полем.
 */
export const MATERIAL_TEXT_MAX_LENGTH =
  Number(process.env.MATERIAL_TEXT_MAX_LENGTH) > 0
    ? Number(process.env.MATERIAL_TEXT_MAX_LENGTH)
    : 200_000;

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

  @IsOptional()
  @IsString()
  scormPackageId?: string;

  /**
   * ТЗ 2.5.a: тело текстового материала. Потолок — настройка со значением по умолчанию
   * (правило ТЗ: лимит задаётся настройкой), читается из окружения на старте.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MATERIAL_TEXT_MAX_LENGTH)
  textBody?: string;

  /** ТЗ 2.5.a: адрес внешнего материала. Только http/https — см. `assertExternalUrl`. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;
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

  @IsOptional()
  @IsString()
  scormPackageId?: string;

  /** ТЗ 2.5.a: тело текстового материала. Пустая строка = очистить. */
  @IsOptional()
  @IsString()
  @MaxLength(MATERIAL_TEXT_MAX_LENGTH)
  textBody?: string;

  /** ТЗ 2.5.a: адрес внешнего материала. Пустая строка = очистить. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;
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

  /** МГ-B7.1: причина отчисления — на экране обязательна (РМ62), в контракте остаётся необязательной. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

const enrollmentResultValues = ['passed', 'failed', 'absent'] as const;

/** МГ-B7.1 (РМ61, РМ64): итог по зачислению; `null` снимает отметку. */
export class MarkEnrollmentResultRequest {
  @ValidateIf((_, v) => v !== null)
  @IsIn(enrollmentResultValues)
  resultCode!: (typeof enrollmentResultValues)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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

  /**
   * Назначение проверки (ТЗ 10.4, решение Р9). Не задано — выводится из привязки к модулю.
   * Отмечать явно нужно только тренировочное тестирование: вывести его не из чего, а правила
   * у него другие — попытки не ограничены и в протокол оно не идёт.
   */
  @IsOptional()
  @IsIn(['final', 'module', 'practice'])
  purpose?: 'final' | 'module' | 'practice';

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
  // clear-vs-keep: `null` clears a field (service normalizes → undefined), omitting keeps it.
  // `@IsOptional()` already treats `null` as "missing" and skips the inner validators,
  // while still rejecting malformed non-null input — so only the TS types widen here.
  @IsOptional()
  @IsInt()
  @Min(1)
  academicHours?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  recertificationPeriodMonths?: number | null;

  @IsOptional()
  @IsIn(TRAINING_TYPES)
  trainingType?: TrainingType | null;

  @IsOptional()
  @IsIn(LEARNER_CATEGORIES)
  learnerCategory?: LearnerCategory | null;

  @IsOptional()
  @IsIn(STUDY_FORMS)
  studyForm?: StudyForm | null;

  @IsOptional()
  @IsIn(FINAL_ASSESSMENT_FORMS)
  finalAssessmentForm?: FinalAssessmentForm | null;

  // arrays clear via `[]`, not `null`
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  regulatoryBasisCodes?: string[];

  @IsOptional()
  @IsString()
  programAttachmentFileId?: string | null;

  @IsOptional()
  @IsString()
  commissionId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otProgramCodes?: string[];

  /** Фаза 2 Task 6 (ФТ-B3.1): доля ролика для зачёта видео-урока. `null` → умолчание 90%. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  videoCompletionPercent?: number | null;

  /** Фаза 2 Task 7 (ФТ-B3.2): запрет перемотки вперёд при первом просмотре. */
  @IsOptional()
  @IsBoolean()
  noSeekOnFirstView?: boolean | null;

  /** Фаза 2 Task 11 (ФТ-E1): строгий порядок прохождения модулей. */
  @IsOptional()
  @IsBoolean()
  sequentialModules?: boolean | null;
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
/** ФТ-E3 (Фаза 3 Task 10): закрытие группы с проверками готовности. */
export class CloseGroupWithChecksRequest {
  @IsString()
  @MinLength(1)
  courseId!: string;

  @IsString()
  @MinLength(1)
  protocolTemplateId!: string;

  @IsString()
  @MinLength(1)
  certificateTemplateId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  enrollmentIds!: string[];
}

/**
 * ФТ-E3 (Фаза 5 Task 7): цепочка «экзамен → протокол → документы → реестр».
 * Список зачислений НЕ передаётся — цепочка сама отбирает сдавших и отчитывается
 * по отсеянным поимённо (частичный успех).
 */
export class CloseGroupChainRequest {
  @IsString()
  @MinLength(1)
  courseId!: string;

  @IsString()
  @MinLength(1)
  protocolTemplateId!: string;

  @IsString()
  @MinLength(1)
  certificateTemplateId!: string;

  /** Повтор с тем же ключом возвращает прежний отчёт и не создаёт вторую выгрузку. */
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsOptional()
  @IsIn(['xlsx', 'xml'])
  format?: 'xlsx' | 'xml';
}

/**
 * Массовое закрытие групп (вопрос №13, решение 08.09.2026).
 *
 * Шаблоны — общие на всю пачку: в этом и смысл массового закрытия, что бланк протокола и
 * удостоверения один. Курс НЕ передаётся: он берётся у самой группы, а группа с несколькими
 * курсами пропускается с объяснением — выбирать за человека, какой из двух курсов закрывать,
 * нельзя.
 */
export class CloseGroupsChainBulkRequest {
  @IsArray()
  @ArrayMinSize(1)
  /*
   * Потолок в 50 групп — не вкус: закрытие каждой выпускает документы и строит выгрузку в
   * реестр. Пачка на тысячу групп висела бы минутами, и человек решил бы, что всё зависло.
   */
  @ArrayMaxSize(50)
  @IsString({ each: true })
  groupIds!: string[];

  @IsString()
  @MinLength(1)
  protocolTemplateId!: string;

  @IsString()
  @MinLength(1)
  certificateTemplateId!: string;

  /** Повтор с тем же ключом безопасен: ключ каждой группы выводится из этого. */
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsOptional()
  @IsIn(['xlsx', 'xml'])
  format?: 'xlsx' | 'xml';
}

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

/**
 * Причина обезличивания персональных данных (ревизия 2026-08-26).
 *
 * Операция необратима, а причина попадает в ответ, которым администратор отвечает
 * заявителю, и в журнал действий. Тело раньше описывалось литералом в сигнатуре и не
 * проверялось вовсе — можно было прислать число или объект.
 *
 * Причина необязательна: заявление может не содержать формулировки, и требовать её
 * значило бы блокировать законное требование человека об удалении данных.
 */
export class ErasePersonalDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
