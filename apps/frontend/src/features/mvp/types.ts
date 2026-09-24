import type {
  GeneratedBaseFilterQuery as BaseFilterQuery,
  GeneratedSessionDto as SessionDto
} from '@trudskill/api-contracts/src/generated/contracts.generated';

export type { BaseFilterQuery, SessionDto };

/** Параметры `GET /reports/kpi-snapshot` (расширяет тип спискового фильтра). */
/**
 * Порция 29 (журнал 278): отбор людей по роли. Отдельный тип, потому что общий
 * `BaseFilterQuery` генерируется из контрактов, а этот параметр есть только у списка людей.
 */
export type UsersListQuery = BaseFilterQuery & { role?: string };

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
  /** МГ-J3.2 (0112): должность сотрудника; у старых учёток пусто. */
  position?: string | null;
  /**
   * Коды ролей человека (ТЗ 5.6 / Э6). Поле необязательное: его отдаёт только список
   * `GET /users`, карточка одного пользователя берёт роли отдельной ручкой.
   */
  roles?: string[];
}

export interface RoleEntity {
  id: string;
  tenantId: string;
  code: string;
  name: string;
}

/** МГ-J3.2: «Пригласить сотрудника» — тело `POST /users/invite`. */
export interface InviteUserPayload {
  email: string;
  displayName: string;
  roleCodes: string[];
  position?: string;
}

/** Ответ приглашения: учётка, роли и что стало с письмом (ушло / ограничение частоты / журнал). */
export interface InviteUserOutcome {
  user: UserEntity & { position?: string | null };
  roles: RoleEntity[];
  invite: { status: 'sent' | 'throttled' | 'logged' };
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
  middleName?: string;
  email?: string;
  organizationUnitId?: string;
  linkedIamUserId?: string;
  /* Личное дело (МГ-C1.1): СНИЛС, дата рождения и паспорт приходят масками. */
  snils?: string;
  dateOfBirth?: string;
  position?: string;
  phone?: string;
  passport?: { series?: string; number?: string; issuedAt?: string; issuedBy?: string } | string;
  gender?: 'm' | 'f';
  birthPlace?: string;
  citizenship?: string;
  registrationAddress?: string;
  educationLevel?: string;
  diploma?: { series?: string; number?: string; institution?: string; surnameInDiploma?: string };
  trackingNumber?: string;
  deliveryMethod?: string;
  counterpartyId?: string;
  extraFields?: Record<string, string>;
}

/** ФТ-E5: строка «Документы» портала заказчика — проекция без содержимого и ПДн-словаря. */
export interface PortalDocument extends BaseEntity {
  documentType: string;
  name: string;
  documentNumber?: string;
  documentDate?: string;
  validUntil?: string;
  learnerId?: string;
  learnerName?: string;
}

export interface Direction extends BaseEntity {
  code: string;
  name: string;
  /** МГ-E1.1: вложенность и порядок направлений. */
  parentDirectionId?: string;
  sortOrder?: number;
  note?: string;
}

export interface Course extends BaseEntity {
  code: string;
  title: string;
  description?: string;
  isArchived: boolean;
  /** МГ-E1.1: направление курса. */
  directionId?: string;
  /* МГ-E2.1 (срез 16.3): поля карточки курса CDOPROF. */
  presentationTitle?: string;
  sortNo?: number;
  price?: number;
  responsibleUserId?: string;
  /** ФИО ответственного — подставляет сервер в `GET /courses/:id`. */
  responsibleName?: string | null;
  note?: string;
  periodDaysDefault?: number;
  frdoDocumentKind?: string;
  certificateNumberParts?: string[];
  docExtraFields?: Array<{ key: string; label: string; value: string }>;
}

/** Тело `PUT /courses/:id` для раздела «Основное» (`null` — очистить). */
export interface CoursePayload {
  code?: string;
  title?: string;
  description?: string;
  directionId?: string | null;
  presentationTitle?: string | null;
  sortNo?: number | null;
  price?: number | null;
  responsibleUserId?: string | null;
  note?: string | null;
  periodDaysDefault?: number | null;
  frdoDocumentKind?: string | null;
  certificateNumberParts?: string[] | null;
  docExtraFields?: Array<{ key: string; label: string; value: string }> | null;
}

/** Вид документа ФИС ФРДО (`GET /frdo-document-kinds`). */
export interface FrdoDocumentKind {
  code: string;
  templateType: string;
  frdoKind: string;
  educationLevel: string;
  exactName: string;
  isActive: boolean;
}

export interface CourseVersion extends BaseEntity {
  courseId: string;
  versionNo: number;
  // Pillar A program meta (§5.1) — optional fields, filled before publish
  academicHours?: number;
  trainingType?: TrainingType;
  learnerCategory?: LearnerCategory;
  studyForm?: StudyForm;
  finalAssessmentForm?: FinalAssessmentForm;
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string;
  commissionId?: string;
  // ОТ-реестр (Минтруд/ЕИСОТ) — program mapping
  otProgramCodes?: string[];
  /** Фаза 2 Task 6 (ФТ-B3.1): доля ролика для зачёта видео-урока; `null` = умолчание 90%. */
  videoCompletionPercent?: number | null;
  /** Фаза 2 Task 7 (ФТ-B3.2): запрет перемотки вперёд при первом просмотре. */
  noSeekOnFirstView?: boolean | null;
  /** Фаза 2 Task 11 (ФТ-E1): строгий порядок прохождения модулей. */
  sequentialModules?: boolean | null;
  /** ФТ-E4 (Фаза 4 Task 9): срок действия удостоверения, мес.; `null` = бессрочно. */
  recertificationPeriodMonths?: number | null;
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
  materialType: 'file' | 'external_url' | 'text' | 'video' | 'scorm';
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
  fileId?: string;
  /** Phase 9 Plan A: package for materialType='scorm' (FK learning.scorm_packages, status ready). */
  scormPackageId?: string;
  /** ТЗ 2.5.a: тело текстового материала (`materialType='text'`), простой текст без разметки. */
  textBody?: string;
  /** ТЗ 2.5.a: адрес внешнего материала (`materialType='external_url'`), только http/https. */
  externalUrl?: string;
}

export interface Group extends BaseEntity {
  code: string;
  name: string;
  /** Поля CDOPROF (ТЗ перехода §4; срез 8.1 на сервере, 8.3 на экране). Все — необязательные. */
  counterpartyId?: string;
  responsibleUserId?: string;
  /** ФИО ответственного — подставляет сервер в `GET /groups/:id` (МГ-B1.2). */
  responsibleName?: string | null;
  startDate?: string;
  endDate?: string;
  examDate?: string;
  studyForm?: string;
  isDot?: boolean;
  comment?: string;
  learnerMessage?: string;
  closedAt?: string;
  archivedAt?: string;
}

/** Тело создания/правки группы: старое `{ code, name, status }` — частный случай. */
export interface GroupPayload {
  code?: string;
  name?: string;
  status?: string;
  /** `null` при правке — очистить поле (сервер это принимает; МГ-B4.1). */
  startDate?: string | null;
  endDate?: string | null;
  examDate?: string | null;
  studyForm?: string;
  isDot?: boolean;
  comment?: string | null;
  learnerMessage?: string | null;
  counterpartyId?: string | null;
  responsibleUserId?: string | null;
}

/** Отборы реестра групп (МГ-B3.2): к общему списку — быстрый отбор и показ архива. */
export type GroupsListQuery = BaseFilterQuery & { quick?: string; include_archived?: string };

export interface GroupCourse extends BaseEntity {
  /** Дней на курс в группе; нет — по сроку курса. */
  durationDays?: number;
  /** МГ-E4.5: преподаватель курса в группе (для протокола). */
  teacherUserId?: string;
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
  /** Phase 4 Plan B: per-student proctoring override; absent = inherit from group-course. */
  proctoringOverride?: 'require' | 'exempt';
  /** МГ-B7.1: итог по зачислению; `absent` — «не явился» (куратор), остальное проставит экзамен. */
  resultCode?: EnrollmentResultCode;
}

export type EnrollmentResultCode = 'passed' | 'failed' | 'absent';

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
  /** Wave 1: gating module for this test (undefined ⇒ final/course exam). */
  moduleId?: string;
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

/** Мастер группы (МГ-B2): доступы шага 4 — письмо, лист доступов (Фаза 6) или позже. */
export type WizardAccessMode = 'email' | 'sheet' | 'later';

/** Строка слушателя из вставки «ФИО; должность; СНИЛС; email; телефон» (шаг 3 мастера). */
export interface GroupWizardLearnerRow {
  rowNumber: number;
  fullName: string;
  position?: string;
  snils?: string;
  email?: string;
  phone?: string;
}

/** Тело `POST /groups/wizard` (срез 8.4): группа (или черновик шага 1), курсы, слушатели, доступы. */
export interface GroupWizardRequest {
  idempotencyKey: string;
  group: GroupPayload & { draftId?: string };
  /** МГ-B6.1: из какой группы скопировано — только для аудита. */
  copyOfGroupId?: string;
  courses: Array<{ courseId: string; courseVersionId?: string; durationDays?: number }>;
  learners?: { existingIds?: string[]; employeeIds?: string[]; rows?: GroupWizardLearnerRow[] };
  access: { mode: WizardAccessMode; message?: string };
}

export interface GroupWizardOutcomeRow {
  /** 0 — существующий слушатель, выбранный из базы; иначе номер строки вставки. */
  rowNumber: number;
  status: 'created' | 'reused' | 'enrolled_only' | 'failed';
  learnerId?: string;
  /** МГ-D2.1 (срез 14.4): строка «из сотрудников компании». */
  employeeId?: string;
  enrollmentId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Ответ мастера: группа создана всегда, слушатели — с частичным успехом. */
export interface GroupWizardOutcome {
  idempotencyKey: string;
  group: Group;
  coursesAssigned: number;
  enrollments: {
    total: number;
    created: number;
    reused: number;
    failed: number;
    rows: GroupWizardOutcomeRow[];
  };
  access: { mode: WizardAccessMode; sent: number; sheetFileId: string | null; deferred: boolean };
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

// === Pillar A — Plan A (§5.1, §5.2, §5.3) ===

export type CommissionStatus = 'active' | 'archived';
export type CommissionMemberRole =
  | 'chairman'
  | 'deputy_chairman'
  | 'member'
  | 'secretary'
  | 'external_expert';
export type TrainingType = 'primary' | 'repeat' | 'target' | 'extraordinary';
export type LearnerCategory = 'worker' | 'specialist' | 'manager' | 'mixed';
export type StudyForm = 'in_person' | 'distance' | 'blended';
export type FinalAssessmentForm = 'test' | 'exam' | 'defense' | 'interview';

export interface Commission {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  status: CommissionStatus;
  createdAt: string;
  updatedAt: string;
}

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
}

export interface CommissionWithMembers extends Commission {
  members: CommissionMember[];
}

export interface ProgramMetaPatch {
  // clear-vs-keep: `null` clears a scalar/enum/FK field, omitting it keeps the value.
  academicHours?: number | null;
  trainingType?: TrainingType | null;
  learnerCategory?: LearnerCategory | null;
  studyForm?: StudyForm | null;
  finalAssessmentForm?: FinalAssessmentForm | null;
  // arrays clear via `[]`
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string | null;
  commissionId?: string | null;
  // ОТ-реестр (Минтруд/ЕИСОТ) — program mapping
  otProgramCodes?: string[];
  /** Фаза 2 Task 6 (ФТ-B3.1): доля ролика для зачёта видео-урока; `null` = умолчание 90%. */
  videoCompletionPercent?: number | null;
  /** Фаза 2 Task 7 (ФТ-B3.2): запрет перемотки вперёд при первом просмотре. */
  noSeekOnFirstView?: boolean | null;
  /** Фаза 2 Task 11 (ФТ-E1): строгий порядок прохождения модулей. */
  sequentialModules?: boolean | null;
}

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

export interface CourseDocumentSetEntryDraft {
  templateId: string;
  position: number;
  isRequired: boolean;
  autoIssueOnCompletion: boolean;
}

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
