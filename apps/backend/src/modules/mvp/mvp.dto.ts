import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength
} from 'class-validator';

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
}

export interface UpdateSimpleRegistryRequest {
  code?: string;
  name?: string;
  status?: string;
  linkedIamUserId?: string | null;
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

export interface UpdateCourseRequest {
  code?: string;
  title?: string;
  description?: string;
  status?: string;
}

export interface CreateModuleRequest {
  courseVersionId: string;
  title: string;
  minViewSeconds?: number;
  isRequired?: boolean;
}

export interface UpdateModuleRequest {
  title?: string;
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
}

export interface CreateMaterialRequest {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  fileId?: string;
}

export interface UpdateMaterialRequest {
  title?: string;
  materialType?: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
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
}

export interface UpdateGroupCourseRequest {
  durationDays?: number | null;
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

export class CreateBulkEnrollmentsRequest {
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  learnerIds!: string[];
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

export interface CreateQuestionBankRequest {
  code?: string;
  title: string;
  description?: string;
  courseId?: string;
}

export interface UpdateQuestionBankRequest {
  code?: string;
  title?: string;
  description?: string;
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

export interface CreateQuestionRequest {
  questionBankId: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  title?: string;
  body?: string;
  score?: number;
  text?: string;
  explanation?: string;
  maxScore?: number;
  answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
  options?: Array<{ text: string; isCorrect?: boolean }>;
}

export interface UpdateQuestionRequest {
  title?: string;
  body?: string;
  score?: number;
  text?: string;
  explanation?: string;
  maxScore?: number;
  status?: string;
  answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
  options?: Array<{ text: string; isCorrect?: boolean }>;
}

export class CreateTestRequest {
  @IsString()
  @MinLength(1)
  courseId!: string;

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
  rules?: Partial<TestRulesDto>;
}

export interface UpdateTestRequest {
  title?: string;
  description?: string;
  status?: string;
}

export interface PatchTestRulesRequest extends Partial<TestRulesDto> {}

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

export interface SaveAnswerRequest {
  questionId: string;
  answerOptionIds?: string[];
  selectedOptionIds?: string[];
  textAnswer?: string;
}

export class SaveAttemptAnswerRequest {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsOptional()
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

export interface UpdateAssignmentRequest {
  title?: string;
  description?: string;
  maxScore?: number;
  status?: string;
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

export interface UpdateAssignmentReviewRequest {
  score?: number;
  comment?: string;
  reviewStatus?: 'pending' | 'in_review' | 'completed';
}
