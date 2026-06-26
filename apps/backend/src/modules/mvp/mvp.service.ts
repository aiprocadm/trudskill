import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PreconditionFailedException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { computeAnalyticsDashboard } from './analytics-dashboard.js';
import { gradeAnswer } from './assessment-autograde.service.js';
import { ENROLLMENT_COMPLETED_EVENT } from './enrollment-completed.event.js';
import { ENROLLMENT_INVITED_EVENT } from './enrollment-invited.event.js';
import { learnerRecipient } from './enrollment-recipient.js';
import {
  summarizeCounterpartyProgress,
  summarizeGroupProgress
} from './group-progress-summary.service.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import {
  PRE_EXAM_TOKEN_TTL_MS,
  buildPreExamAuthUrl,
  generatePreExamToken,
  hashPreExamToken
} from './pre-exam-token.js';
import { resolveProctoringRequirement } from './proctoring/proctoring-requirement.js';
import { buildReport } from './report-builder/build-report.js';
import { getEntity, listReportEntityMeta } from './report-builder/report-entities.js';
import { ReportXlsxWriter } from './report-builder/report-xlsx.writer.js';
import { aggregateReviewerQueue } from './reviewer-queue.service.js';
import { backendEnv } from '../../env.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { FilesService } from '../files/files.service.js';
import { LicensesService } from '../org/licenses.service.js';

import type { BulkImportOutcome } from './learners-bulk-import.types.js';
import type {
  AddCommissionMemberRequest,
  BaseFilterQuery,
  CreateAnswerHttpRequest,
  CreateAssignmentRequest,
  CreateAssignmentReviewRequest,
  CreateAssignmentSubmissionRequest,
  CreateBulkEnrollmentsRequest,
  CreateCommissionRequest,
  CreateCourseRequest,
  CreateEnrollmentRequest,
  CreateGroupCourseRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateQuestionBankRequest,
  CreateQuestionRequest,
  CreateSimpleRegistryRequest,
  CreateTestRequest,
  PatchTestRulesRequest,
  PutCourseDocumentSetRequest,
  SaveAnswerRequest,
  SaveAttemptAnswerRequest,
  StartAttemptRequest,
  TestRulesDto,
  UpdateAssignmentRequest,
  UpdateAssignmentReviewRequest,
  UpdateAssignmentSubmissionRequest,
  UpdateCommissionRequest,
  UpdateCourseRequest,
  UpdateEnrollmentStatusRequest,
  UpdateGroupCourseRequest,
  UpdateMaterialProgressRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateProgramMetaRequest,
  UpdateQuestionBankRequest,
  UpdateQuestionRequest,
  UpdateSimpleRegistryRequest,
  UpdateTestRequest
} from './mvp.dto.js';
import type {
  AnalyticsDashboardDto,
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  Attempt,
  AttemptAnswer,
  AttemptQuestionView,
  BaseEntity,
  BulkEnrollmentItemError,
  BulkEnrollmentsOutcome,
  Commission,
  CommissionMember,
  CommissionStatus,
  CompleteAttemptReviewInput,
  Counterparty,
  Course,
  CourseDocumentSetEntry,
  CourseModuleEntity,
  CourseProgress,
  CourseVersion,
  Direction,
  Enrollment,
  EnrollmentStatus,
  EnrollmentStatusHistory,
  ExamResult,
  FrdoDocumentKind,
  GroupCourse,
  GroupEntity,
  IdentityVerification,
  IdentityVerificationView,
  KpiSnapshotDto,
  Learner,
  LearnerAssignmentSummary,
  LearnerTestSummary,
  Material,
  MaterialProgress,
  ModuleProgress,
  OtTrainingProgram,
  PreExamToken,
  ProctoringChunkIssue,
  ProctoringOverride,
  ProctoringPlaybackChunk,
  ProctoringRecording,
  ProctoringRecordingDetail,
  ProctoringRecordingView,
  ProgressStatus,
  Question,
  QuestionBank,
  RegulatoryAct,
  ReportEntitiesMetaDto,
  ReportExportDto,
  ReportPreviewDto,
  ReportTemplate,
  ReturnSubmissionInput,
  ReviewerQueueSnapshot,
  TestAttempt,
  TestEntity,
  TestQuestion
} from './mvp.types.js';
import type { ReportEntityKey, ResolveCtx } from './report-builder/report-types.js';
import type { BuildReportRequestDto, SaveReportTemplateDto } from './report-builder.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type {
  DocumentSignatureStatus,
  GeneratedDocumentEntity
} from '../documents/documents.types.js';
import type { UploadIntent } from '../files/files.service.js';

interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface LookupItem {
  id: string;
  label: string;
  status: string;
}

/** Контекст для GET/list assessment: ограничение по linkedIamUserId для слушателя. */
interface MvpAssessmentReadAccess {
  actorId?: string;
  permissions?: string[];
}

/**
 * Phase 1 §4.3 — DTO выданного документа в кабинете слушателя.
 *
 * Намеренно компактный набор полей: всё, что нужно UI для «карточки документа»
 * + ссылка на QR-проверку + stub URL для будущего PDF-стрима. Полная entity
 * `GeneratedDocumentEntity` содержит служебные поля (templateVersionId, fileId,
 * isFinal и т.п.), которые слушателю не нужны и могут утечь имплементацию.
 */
export interface LearnerDocumentDto {
  id: string;
  documentType: string;
  name: string;
  documentNumber?: string;
  documentDate?: string;
  status: string;
  qrToken?: string;
  enrollmentId: string;
  /** Доступно, если зачисление удалось связать с курсом через groupCourse. */
  courseId?: string;
  courseTitle: string;
  /** URL потокового PDF; до Phase 5 фронт показывает stub при клике. */
  downloadUrl: string;
  /** Подсказка фронту: рендерить ли кнопку Download активной. До Phase 5 — false. */
  isDownloadable: boolean;
  /** §5.9 — если документ аннулирован, показать причину под номером. */
  revocationReason?: string;
  /** §5.9 — если перевыпущен, ссылка на новый документ. */
  replacedByDocumentId?: string;
  /** Phase 6 — статус НЭП-подписи (seam dormant → обычно undefined). */
  signatureStatus?: DocumentSignatureStatus;
}

export function mapDocumentToLearnerDto(
  doc: GeneratedDocumentEntity,
  apiPrefix: string,
  enrollmentId: string,
  courseTitle: string,
  courseId?: string
): LearnerDocumentDto {
  // Phase 5: реальный stream PDF. Сейчас fileId='' у всех свежих документов
  // (см. documents.service.generateDocument), поэтому download выключен.
  const hasFile = Boolean(doc.fileId);
  return {
    id: doc.id,
    documentType: doc.documentType,
    name: doc.name,
    documentNumber: doc.documentNumber,
    documentDate: doc.documentDate,
    status: doc.status,
    qrToken: doc.qrToken,
    enrollmentId,
    courseId,
    courseTitle,
    downloadUrl: hasFile ? `${apiPrefix}/files/${doc.fileId}/download` : '',
    isDownloadable: hasFile,
    revocationReason: doc.revocationReason,
    replacedByDocumentId: doc.replacedByDocumentId,
    ...(doc.signatureStatus ? { signatureStatus: doc.signatureStatus } : {})
  };
}

const DEFAULT_GROUP_COURSE_DURATION_DAYS = 90;

/** Обход ограничения linkedIam/list-scope для GET/list assessment — только через IAM permission. */
const ASSESSMENT_READ_CROSS_LEARNER_PERMISSION = 'assessment.read.cross_learner';
/** Делегирование: мутации прогресса/субмиссий/попыток для слушателя с linkedIamUserId от имени преподавателя/L&D. */
const LEARNERS_ACT_AS_PERMISSION = 'learners.act_as';

/** Phase 4 Plan A: identity uploads accept photos/scans only. */
const IDENTITY_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf'
]);

/** Phase 4 Plan B: MediaRecorder chunks — webm (Chrome/Firefox) + mp4 (Safari fallback). */
const PROCTORING_MIME_ALLOWLIST: ReadonlySet<string> = new Set(['video/webm', 'video/mp4']);

/**
 * Global lookup нормативных актов — зеркало seed из migration 0030.
 * Используется как DTO-каталог для UI (мульти-селект в форме программы курса).
 * Postgres-implementation должна читать из `lookup.regulatory_acts` напрямую;
 * в in-memory режиме храним константу здесь.
 */
const REGULATORY_ACTS_SEED: RegulatoryAct[] = [
  {
    code: 'PP_2464_2022',
    shortName: 'ПП 2464',
    fullName:
      'Постановление Правительства РФ от 24.12.2022 №2464 «О порядке обучения по охране труда»',
    issuingAuthority: 'Правительство РФ',
    issuedAt: '2022-12-24',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PRIKAZ_26N_2024',
    shortName: 'Приказ Минтруда 26н',
    fullName: 'Приказ Минтруда РФ от 17.01.2024 №26н',
    issuingAuthority: 'Минтруд России',
    issuedAt: '2024-01-17',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'FZ_116_1997',
    shortName: 'ФЗ-116',
    fullName:
      'Федеральный закон от 21.07.1997 №116-ФЗ «О промышленной безопасности опасных производственных объектов»',
    issuingAuthority: 'Государственная Дума РФ',
    issuedAt: '1997-07-21',
    appliesToVerticals: ['pb'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PP_2168_2022',
    shortName: 'ПП 2168',
    fullName:
      'Постановление Правительства РФ от 29.11.2022 №2168 «О порядке аттестации в области промышленной безопасности»',
    issuingAuthority: 'Правительство РФ',
    issuedAt: '2022-11-29',
    appliesToVerticals: ['pb'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PRIKAZ_707N_2015',
    shortName: 'Приказ Минздрава 707н',
    fullName: 'Приказ Минздрава РФ от 08.10.2015 №707н',
    issuingAuthority: 'Минздрав России',
    issuedAt: '2015-10-08',
    appliesToVerticals: ['nmo'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'FZ_273_2012_ART_196',
    shortName: 'ФЗ-273 ст.196',
    fullName: 'Федеральный закон от 29.12.2012 №273-ФЗ «Об образовании в РФ», ст. 196 — ДПО',
    issuingAuthority: 'Государственная Дума РФ',
    issuedAt: '2012-12-29',
    appliesToVerticals: ['ot', 'pb', 'nmo', 'emergency', 'other'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  }
];

/**
 * Global lookup программ обучения по ОТ — зеркало seed из migration 0045.
 * Используется как DTO-каталог для UI (мульти-селект в форме программы курса).
 * Postgres-implementation должна читать из `lookup.ot_training_programs` напрямую;
 * в in-memory режиме храним константу здесь.
 */
// PROVISIONAL — сверить frdoKind/exactName с офиц. перечнем/шаблоном ФРДО (Рособрнадзор) перед боевой отправкой.
const FRDO_DOCUMENT_KINDS_SEED: FrdoDocumentKind[] = [
  {
    code: 'PK',
    templateType: 'certificate',
    frdoKind: 'Удостоверение о повышении квалификации',
    educationLevel: 'ДПО',
    exactName: 'Удостоверение о повышении квалификации',
    isActive: true
  },
  {
    code: 'PP',
    templateType: 'diploma',
    frdoKind: 'Диплом о профессиональной переподготовке',
    educationLevel: 'ДПО',
    exactName: 'Диплом о профессиональной переподготовке',
    isActive: true
  }
];

const OT_TRAINING_PROGRAMS_SEED: OtTrainingProgram[] = [
  {
    code: 'OT_A',
    registryId: 1,
    exactName:
      'Обучение по общим вопросам охраны труда и функционирования системы управления охраной труда',
    programKind: 'A',
    isActive: true
  },
  {
    code: 'OT_B',
    registryId: 2,
    exactName:
      'Обучение безопасным методам и приёмам выполнения работ при воздействии вредных и (или) опасных производственных факторов, источников опасности, идентифицированных в рамках специальной оценки условий труда и оценки профессиональных рисков',
    programKind: 'B',
    isActive: true
  },
  {
    code: 'OT_V',
    registryId: 3,
    exactName: 'Обучение безопасным методам и приёмам выполнения работ повышенной опасности',
    programKind: 'V',
    isActive: true
  },
  {
    code: 'OT_FIRST_AID',
    registryId: 4,
    exactName: 'Обучение по оказанию первой помощи пострадавшим',
    programKind: 'first_aid',
    isActive: true
  },
  {
    code: 'OT_SIZ',
    registryId: 5,
    exactName: 'Обучение по использованию (применению) средств индивидуальной защиты',
    programKind: 'siz',
    isActive: true
  }
];

@Injectable()
export class MvpService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(TenantScopedRepository) private readonly tenantScopedRepository: TenantScopedRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Optional() @Inject(LicensesService) private readonly licensesService?: LicensesService
  ) {}

  /** Wave 1 Plan 2: logging stub for the pre-exam identity link delivery (no constructor change). */
  private readonly preExamLogger = new Logger('PreExamAuth');

  /** Phase 4 Plan A: identity verification lifecycle events (rejection log stub). */
  private readonly identityVerificationLogger = new Logger('IdentityVerification');

  /** V1.1 AV gate: logs best-effort proactive scan failures (the download gate re-scans lazily). */
  private readonly avScanLogger = new Logger('AvScan');

  listCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<Counterparty> {
    return this.list(this.state.counterparties, tenantId, query);
  }

  getCounterparty(tenantId: string, id: string): Counterparty {
    return this.getById(this.state.counterparties, tenantId, id);
  }

  lookupCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.counterparties, tenantId, query, (item) => item.name);
  }

  createCounterparty(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Counterparty {
    const entity: Counterparty = {
      id: this.id('cp'),
      tenantId,
      code: request.code,
      name: request.name,
      legalName: request.name,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.counterparties.push(entity);
    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_created',
      'crm.counterparty',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateCounterparty(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Counterparty {
    const current = this.getById(this.state.counterparties, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_updated',
      'crm.counterparty',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  /**
   * Phase 2 Plan C — POST расширенной компании-заказчика
   * (ИНН/КПП/контакты/адрес/заметка). Симметрично createLearnerExtended.
   */
  createCounterpartyExtended(
    tenantId: string,
    actorId: string | undefined,
    request: {
      code: string;
      name: string;
      legalName?: string;
      inn?: string;
      kpp?: string;
      contactEmail?: string;
      contactPhone?: string;
      legalAddress?: string;
      note?: string;
      status?: string;
    },
    context: RequestContext
  ): Counterparty {
    const entity: Counterparty = {
      id: this.id('cp'),
      tenantId,
      code: request.code.trim(),
      name: request.name.trim(),
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    if (request.legalName?.trim()) entity.legalName = request.legalName.trim();
    if (request.inn?.trim()) entity.inn = request.inn.trim();
    if (request.kpp?.trim()) entity.kpp = request.kpp.trim();
    if (request.contactEmail?.trim()) entity.contactEmail = request.contactEmail.trim();
    if (request.contactPhone?.trim()) entity.contactPhone = request.contactPhone.trim();
    if (request.legalAddress?.trim()) entity.legalAddress = request.legalAddress.trim();
    if (request.note?.trim()) entity.note = request.note.trim();
    this.state.counterparties.push(entity);
    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_created',
      'crm.counterparty',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  /**
   * Phase 2 Plan C — PATCH расширенной компании.
   * Симметрично updateLearnerExtended. Семантика: undefined = не трогать,
   * null = очистить (для clearable полей).
   */
  updateCounterpartyExtended(
    tenantId: string,
    actorId: string | undefined,
    counterpartyId: string,
    request: {
      code?: string;
      name?: string;
      legalName?: string | null;
      inn?: string | null;
      kpp?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      legalAddress?: string | null;
      note?: string | null;
      status?: string;
    },
    context: RequestContext
  ): Counterparty {
    const current = this.getById(this.state.counterparties, tenantId, counterpartyId);
    const oldValues: Counterparty = { ...current };

    if (request.code !== undefined) current.code = request.code.trim();
    if (request.name !== undefined) current.name = request.name.trim();
    if (request.legalName !== undefined) current.legalName = request.legalName?.trim() || undefined;
    if (request.inn !== undefined) current.inn = request.inn?.trim() || undefined;
    if (request.kpp !== undefined) current.kpp = request.kpp?.trim() || undefined;
    if (request.contactEmail !== undefined)
      current.contactEmail = request.contactEmail?.trim() || undefined;
    if (request.contactPhone !== undefined)
      current.contactPhone = request.contactPhone?.trim() || undefined;
    if (request.legalAddress !== undefined)
      current.legalAddress = request.legalAddress?.trim() || undefined;
    if (request.note !== undefined) current.note = request.note?.trim() || undefined;
    if (request.status !== undefined) current.status = request.status;

    current.updatedAt = this.now();

    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_updated',
      'crm.counterparty',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listLearners(tenantId: string, query: BaseFilterQuery): ListResponse<Learner> {
    return this.list(this.state.learners, tenantId, query);
  }

  getLearner(tenantId: string, id: string): Learner {
    return this.getById(this.state.learners, tenantId, id);
  }

  lookupLearners(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.learners, tenantId, query, (item) =>
      `${item.firstName} ${item.lastName}`.trim()
    );
  }

  createLearner(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Learner {
    const [firstName, lastName] = request.name.split(' ');
    const entity: Learner = {
      id: this.id('learner'),
      tenantId,
      learnerNo: request.code,
      firstName: firstName ?? request.name,
      lastName: lastName ?? '',
      email: undefined,
      organizationUnitId: request.organizationUnitId?.trim() || undefined,
      linkedIamUserId: request.linkedIamUserId?.trim() || undefined,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.learners.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.learner_created',
      'learning.learner',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  /**
   * Phase 2 Plan A — создание учётка с полным набором полей (email/snils/middleName/position).
   * `createLearner` не принимает эти поля (только firstName+lastName из `name.split`).
   * Этот метод используется `LearnersBulkImportService` при импорте из Excel.
   */
  createLearnerExtended(
    tenantId: string,
    actorId: string | undefined,
    request: {
      firstName: string;
      lastName: string;
      middleName?: string;
      email?: string;
      snils?: string;
      position?: string;
      organizationUnitId?: string;
      learnerNo?: string;
      dateOfBirth?: string;
    },
    context: RequestContext
  ): Learner {
    const entity: Learner = {
      id: this.id('learner'),
      tenantId,
      firstName: request.firstName,
      lastName: request.lastName,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    if (request.middleName) entity.middleName = request.middleName;
    if (request.email) entity.email = request.email;
    if (request.snils) entity.snils = request.snils;
    if (request.position) entity.position = request.position;
    if (request.organizationUnitId) entity.organizationUnitId = request.organizationUnitId;
    if (request.learnerNo) entity.learnerNo = request.learnerNo;
    if (request.dateOfBirth) entity.dateOfBirth = request.dateOfBirth;
    this.state.learners.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.learner_created',
      'learning.learner',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateLearner(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Learner {
    const current = this.getById(this.state.learners, tenantId, id);
    const oldValues = { ...current };
    if (request.name) {
      const [firstName, lastName] = request.name.split(' ');
      current.firstName = firstName ?? request.name;
      current.lastName = lastName ?? '';
    }
    if (request.status) current.status = request.status;
    if (request.linkedIamUserId !== undefined && request.linkedIamUserId !== null) {
      current.linkedIamUserId = request.linkedIamUserId.trim() || undefined;
    } else if (request.linkedIamUserId === null) {
      current.linkedIamUserId = undefined;
    }
    if (request.organizationUnitId !== undefined && request.organizationUnitId !== null) {
      current.organizationUnitId = request.organizationUnitId.trim() || undefined;
    } else if (request.organizationUnitId === null) {
      current.organizationUnitId = undefined;
    }
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.learner_updated',
      'learning.learner',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  /**
   * Phase 2 Plan B — PATCH ученика с полным набором полей (firstName/lastName/middleName/email/snils/position).
   * Старый `updateLearner` остаётся для совместимости с существующим UI (counterparties-style).
   *
   * Семантика:
   *  - undefined поле → не трогаем;
   *  - null для clearable полей (email/snils/middleName/position/organizationUnitId/learnerNo/linkedIamUserId) → очищаем;
   *  - linkedIamUserId защищён анти-IDOR: если уже задан и приходит другое непустое значение — 409 conflict.
   *    Чтобы сменить владельца профиля, сначала очистить `linkedIamUserId: null`, потом задать заново.
   */
  updateLearnerExtended(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    request: {
      firstName?: string;
      lastName?: string;
      middleName?: string | null;
      email?: string | null;
      snils?: string | null;
      position?: string | null;
      organizationUnitId?: string | null;
      learnerNo?: string | null;
      dateOfBirth?: string | null;
      status?: string;
      linkedIamUserId?: string | null;
    },
    context: RequestContext
  ): Learner {
    const current = this.getById(this.state.learners, tenantId, learnerId);
    const oldValues: Learner = { ...current };

    // Anti-IDOR: смена linkedIamUserId на другой непустой → conflict.
    if (
      request.linkedIamUserId !== undefined &&
      request.linkedIamUserId !== null &&
      current.linkedIamUserId &&
      current.linkedIamUserId !== request.linkedIamUserId
    ) {
      throw new ConflictException({
        code: 'conflict',
        message: 'linkedIamUserId already bound; clear (null) before reassigning'
      });
    }

    if (request.firstName !== undefined) current.firstName = request.firstName.trim();
    if (request.lastName !== undefined) current.lastName = request.lastName.trim();
    if (request.middleName !== undefined)
      current.middleName = request.middleName?.trim() || undefined;
    if (request.email !== undefined) current.email = request.email?.trim() || undefined;
    if (request.snils !== undefined) current.snils = request.snils?.trim() || undefined;
    if (request.position !== undefined) current.position = request.position?.trim() || undefined;
    if (request.organizationUnitId !== undefined)
      current.organizationUnitId = request.organizationUnitId?.trim() || undefined;
    if (request.learnerNo !== undefined) current.learnerNo = request.learnerNo?.trim() || undefined;
    if (request.dateOfBirth !== undefined)
      current.dateOfBirth = request.dateOfBirth?.trim() || undefined;
    if (request.status !== undefined) current.status = request.status;
    if (request.linkedIamUserId !== undefined)
      current.linkedIamUserId = request.linkedIamUserId ?? undefined;

    current.updatedAt = this.now();

    this.audit(
      tenantId,
      actorId,
      'learning.learner_updated',
      'learning.learner',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listDirections(tenantId: string, query: BaseFilterQuery): ListResponse<Direction> {
    return this.list(this.state.directions, tenantId, query);
  }

  getDirection(tenantId: string, id: string): Direction {
    return this.getById(this.state.directions, tenantId, id);
  }

  lookupDirections(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.directions, tenantId, query, (item) => item.name);
  }

  createDirection(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Direction {
    const entity: Direction = {
      id: this.id('direction'),
      tenantId,
      code: request.code,
      name: request.name,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.directions.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.direction_created',
      'learning.direction',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateDirection(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Direction {
    const current = this.getById(this.state.directions, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.name === 'string') current.name = request.name;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.direction_updated',
      'learning.direction',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listCourses(tenantId: string, query: BaseFilterQuery): ListResponse<Course> {
    return this.list(this.state.courses, tenantId, query);
  }
  getCourse(tenantId: string, id: string): Course {
    return this.getById(this.state.courses, tenantId, id);
  }
  lookupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.courses, tenantId, query, (item) => item.title);
  }

  createCourse(
    tenantId: string,
    actorId: string | undefined,
    request: CreateCourseRequest,
    context: RequestContext
  ): Course {
    const entity: Course = {
      id: this.id('course'),
      tenantId,
      code: request.code,
      title: request.title,
      description: request.description,
      status: 'draft',
      isArchived: false,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.courses.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.course_created',
      'learning.course',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateCourseRequest,
    context: RequestContext
  ): Course {
    const current = this.getById(this.state.courses, tenantId, id);
    if (current.status === 'archived') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Archived course is read-only'
      });
    }
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.description === 'string' || request.description === null)
      current.description = request.description ?? undefined;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_updated',
      'learning.course',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  publishCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Course {
    const course = this.getById(this.state.courses, tenantId, id);
    const versions = this.state.courseVersions.filter(
      (item) => item.tenantId === tenantId && item.courseId === id
    );
    if (versions.length === 0) {
      throw new PreconditionFailedException({
        code: 'precondition_failed',
        message: 'Course must have at least one version'
      });
    }
    course.status = 'published';
    course.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_published',
      'learning.course',
      course.id,
      undefined,
      course,
      context
    );
    return course;
  }

  archiveCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Course {
    const course = this.getById(this.state.courses, tenantId, id);
    course.status = 'archived';
    course.isArchived = true;
    course.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_archived',
      'learning.course',
      course.id,
      undefined,
      course,
      context
    );
    return course;
  }

  listCourseVersions(tenantId: string, query: BaseFilterQuery): ListResponse<CourseVersion> {
    return this.list(this.state.courseVersions, tenantId, query);
  }
  getCourseVersion(tenantId: string, id: string): CourseVersion {
    return this.getById(this.state.courseVersions, tenantId, id);
  }
  createCourseVersion(tenantId: string, courseId: string): CourseVersion {
    this.getById(this.state.courses, tenantId, courseId);
    const versionNo =
      this.state.courseVersions.filter(
        (item) => item.courseId === courseId && item.tenantId === tenantId
      ).length + 1;
    const entity: CourseVersion = {
      id: this.id('cver'),
      tenantId,
      courseId,
      versionNo,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.courseVersions.push(entity);
    return entity;
  }

  listModules(tenantId: string, query: BaseFilterQuery): ListResponse<CourseModuleEntity> {
    return this.list(this.state.modules, tenantId, query);
  }
  getModule(tenantId: string, id: string): CourseModuleEntity {
    return this.getById(this.state.modules, tenantId, id);
  }
  createModule(
    tenantId: string,
    actorId: string | undefined,
    request: CreateModuleRequest,
    context: RequestContext
  ): CourseModuleEntity {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    this.getById(this.state.courseVersions, tenantId, request.courseVersionId);
    const entity: CourseModuleEntity = {
      id: this.id('module'),
      tenantId,
      courseVersionId: request.courseVersionId,
      title: request.title,
      sortOrder: this.state.modules.length,
      minViewSeconds: request.minViewSeconds ?? 0,
      isRequired: request.isRequired ?? true,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.modules.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.module_created',
      'learning.module',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateModule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateModuleRequest,
    context: RequestContext
  ): CourseModuleEntity {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    const current = this.getById(this.state.modules, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.minViewSeconds === 'number') current.minViewSeconds = request.minViewSeconds;
    if (typeof request.isRequired === 'boolean') current.isRequired = request.isRequired;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.module_updated',
      'learning.module',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listMaterials(tenantId: string, query: BaseFilterQuery): ListResponse<Material> {
    return this.list(this.state.materials, tenantId, query);
  }
  getMaterial(tenantId: string, id: string): Material {
    return this.getById(this.state.materials, tenantId, id);
  }
  createMaterial(
    tenantId: string,
    actorId: string | undefined,
    request: CreateMaterialRequest,
    context: RequestContext
  ): Material {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    this.getById(this.state.modules, tenantId, request.moduleId);

    // SCORM-specific validation: package must exist and be ready.
    if (request.materialType === 'scorm') {
      if (!request.scormPackageId) {
        throw new BadRequestException({
          code: 'validation_error',
          message: 'scormPackageId is required for scorm materials'
        });
      }
      const pkg = this.state.scormPackages.find(
        (p) => p.tenantId === tenantId && p.id === request.scormPackageId && p.status !== 'deleted'
      );
      if (!pkg || pkg.packageStatus !== 'ready') {
        throw new PreconditionFailedException({
          code: 'scorm_package_not_ready',
          message: 'SCORM package must be processed before use'
        });
      }
    }

    // SCORM completion is cmi lesson_status-driven, not time-driven; force minViewSeconds=0.
    const resolvedMinViewSeconds =
      request.materialType === 'scorm' ? 0 : (request.minViewSeconds ?? 0);

    const entity: Material = {
      id: this.id('material'),
      tenantId,
      moduleId: request.moduleId,
      title: request.title,
      materialType: request.materialType,
      sortOrder: this.state.materials.length,
      minViewSeconds: resolvedMinViewSeconds,
      isRequired: request.isRequired ?? true,
      fileId: request.materialType !== 'scorm' ? request.fileId : undefined,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    if (request.materialType === 'scorm' && request.scormPackageId) {
      entity.scormPackageId = request.scormPackageId;
    }
    this.state.materials.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.material_created',
      'learning.material',
      entity.id,
      undefined,
      entity,
      context
    );
    if (entity.fileId) {
      void this.filesService
        .ensureMaterialLink(tenantId, entity.id, entity.fileId)
        .catch(() => undefined);
    }
    return entity;
  }
  updateMaterial(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateMaterialRequest,
    context: RequestContext
  ): Material {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    const current = this.getById(this.state.materials, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.minViewSeconds === 'number') current.minViewSeconds = request.minViewSeconds;
    if (typeof request.isRequired === 'boolean') current.isRequired = request.isRequired;
    if (typeof request.fileId === 'string' || request.fileId === null)
      current.fileId = request.fileId ?? undefined;
    if (typeof request.status === 'string') current.status = request.status;
    // For scorm-typed materials, allow updating the referenced package (must be ready).
    if (current.materialType === 'scorm' && request.scormPackageId !== undefined) {
      const pkg = this.state.scormPackages.find(
        (p) => p.tenantId === tenantId && p.id === request.scormPackageId && p.status !== 'deleted'
      );
      if (!pkg || pkg.packageStatus !== 'ready') {
        throw new PreconditionFailedException({
          code: 'scorm_package_not_ready',
          message: 'SCORM package must be processed before use'
        });
      }
      current.scormPackageId = request.scormPackageId;
    }
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.material_updated',
      'learning.material',
      current.id,
      oldValues,
      current,
      context
    );
    if (request.fileId !== undefined && current.fileId) {
      void this.filesService
        .ensureMaterialLink(tenantId, current.id, current.fileId)
        .catch(() => undefined);
    }
    return current;
  }

  listGroups(tenantId: string, query: BaseFilterQuery): ListResponse<GroupEntity> {
    return this.list(this.state.groups, tenantId, query);
  }
  getGroup(tenantId: string, id: string): GroupEntity {
    return this.getById(this.state.groups, tenantId, id);
  }
  lookupGroups(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.groups, tenantId, query, (item) => item.name);
  }
  createGroup(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): GroupEntity {
    const entity: GroupEntity = {
      id: this.id('group'),
      tenantId,
      code: request.code,
      name: request.name,
      status: request.status ?? 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.groups.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.group_created',
      'learning.group',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateGroup(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): GroupEntity {
    const current = this.getById(this.state.groups, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.name === 'string') current.name = request.name;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.group_updated',
      'learning.group',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  /**
   * Phase 2 Plan C — назначить (или снять) компанию-заказчика для группы.
   * counterpartyId === null → снять привязку. Анти-IDOR через tenant boundary в getById
   * (counterparty проверяется в том же tenant).
   */
  setGroupCounterparty(
    tenantId: string,
    actorId: string | undefined,
    groupId: string,
    counterpartyId: string | null,
    context: RequestContext
  ): GroupEntity {
    const current = this.getById(this.state.groups, tenantId, groupId);
    const oldValues: GroupEntity = { ...current };

    if (counterpartyId !== null) {
      this.getById(this.state.counterparties, tenantId, counterpartyId);
      current.counterpartyId = counterpartyId;
    } else {
      current.counterpartyId = undefined;
    }
    current.updatedAt = this.now();

    this.audit(
      tenantId,
      actorId,
      counterpartyId
        ? 'learning.group_counterparty_linked'
        : 'learning.group_counterparty_unlinked',
      'learning.group',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  /**
   * Phase 2 Plan C — собирает прогресс по группе через pure-function summarizer.
   * Проверяет существование группы в tenant (анти-IDOR), затем фильтрует tenant-scoped
   * enrollments + groupCourses и делегирует pure-function aggregator.
   */
  getGroupProgressSummary(tenantId: string, groupId: string) {
    this.getById(this.state.groups, tenantId, groupId);
    const enrollments = this.state.enrollments.filter((e) => e.tenantId === tenantId);
    const groupCourses = this.state.groupCourses.filter((gc) => gc.tenantId === tenantId);
    return summarizeGroupProgress(groupId, { enrollments, groupCourses });
  }

  /**
   * Phase 2 Plan C — собирает прогресс по компании-клиенту = сумма по всем её группам.
   * Фильтрует группы по counterpartyId, затем enrollments+groupCourses этих групп.
   */
  getCounterpartyProgressSummary(tenantId: string, counterpartyId: string) {
    this.getById(this.state.counterparties, tenantId, counterpartyId);
    const groupIds = new Set(
      this.state.groups
        .filter((g) => g.tenantId === tenantId && g.counterpartyId === counterpartyId)
        .map((g) => g.id)
    );
    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && groupIds.has(e.groupId)
    );
    const groupCourses = this.state.groupCourses.filter(
      (gc) => gc.tenantId === tenantId && groupIds.has(gc.groupId)
    );
    return summarizeCounterpartyProgress(counterpartyId, { enrollments, groupCourses });
  }

  listGroupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<GroupCourse> {
    return this.list(this.state.groupCourses, tenantId, query);
  }
  getGroupCourse(tenantId: string, id: string): GroupCourse {
    return this.getById(this.state.groupCourses, tenantId, id);
  }
  createGroupCourse(tenantId: string, request: CreateGroupCourseRequest): GroupCourse {
    this.getById(this.state.groups, tenantId, request.groupId);
    this.getById(this.state.courses, tenantId, request.courseId);
    const duplicate = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === request.groupId &&
        item.courseId === request.courseId
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Group course already exists for pair(group, course)'
      });
    }
    const entity: GroupCourse = {
      id: this.id('gc'),
      tenantId,
      groupId: request.groupId,
      courseId: request.courseId,
      sortOrder: this.state.groupCourses.length,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now(),
      durationDays: this.normalizeDurationDays(request.durationDays),
      ...(request.requiresPreExamAuth !== undefined
        ? { requiresPreExamAuth: request.requiresPreExamAuth }
        : {}),
      ...(request.requiresIdentityVerification !== undefined
        ? { requiresIdentityVerification: request.requiresIdentityVerification }
        : {}),
      ...(request.requiresProctoring !== undefined
        ? { requiresProctoring: request.requiresProctoring }
        : {})
    };
    this.state.groupCourses.push(entity);
    return entity;
  }

  updateGroupCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateGroupCourseRequest,
    context: RequestContext
  ): GroupCourse {
    const current = this.getById(this.state.groupCourses, tenantId, id);
    const oldValues = { ...current };
    if (request.durationDays === null) {
      current.durationDays = undefined;
    } else if (typeof request.durationDays === 'number') {
      current.durationDays = this.normalizeDurationDays(request.durationDays);
    }
    if (request.requiresPreExamAuth !== undefined) {
      current.requiresPreExamAuth = request.requiresPreExamAuth;
    }
    if (request.requiresIdentityVerification !== undefined) {
      current.requiresIdentityVerification = request.requiresIdentityVerification;
    }
    if (request.requiresProctoring !== undefined) {
      current.requiresProctoring = request.requiresProctoring;
    }
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.group_course_updated',
      'learning.group_course',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listEnrollments(tenantId: string, query: BaseFilterQuery): ListResponse<Enrollment> {
    return this.list(this.state.enrollments, tenantId, query);
  }

  getKpiSnapshot(tenantId: string, query: BaseFilterQuery): KpiSnapshotDto {
    const courseId = query.course_id;
    const groupId = query.group_id;
    const enrolledFrom = query.enrolled_from ?? query.created_from;
    let enrolledTo = query.enrolled_to ?? query.created_to;
    if (enrolledTo && enrolledTo.length === 10 && !enrolledTo.includes('T'))
      enrolledTo = `${enrolledTo}T23:59:59.999Z`;

    const enrollmentInScope = (e: Enrollment): boolean => {
      if (groupId && e.groupId !== groupId) return false;
      if (courseId) {
        const linked = this.state.groupCourses.some(
          (gc) => gc.tenantId === tenantId && gc.groupId === e.groupId && gc.courseId === courseId
        );
        if (!linked) return false;
      }
      if (enrolledFrom && e.enrolledAt < enrolledFrom) return false;
      if (enrolledTo && e.enrolledAt > enrolledTo) return false;
      return true;
    };

    const scopedEnrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && enrollmentInScope(e)
    );
    const completed = scopedEnrollments.filter((e) => e.status === 'completed').length;
    const total = scopedEnrollments.length;
    const completionRate = total === 0 ? 0 : completed / total;

    const examScoped = this.state.examResults.filter((er) => {
      if (er.tenantId !== tenantId) return false;
      const en = this.state.enrollments.find(
        (x) => x.id === er.enrollmentId && x.tenantId === tenantId
      );
      if (!en || !enrollmentInScope(en)) return false;
      if (courseId) {
        const test = this.state.tests.find((t) => t.id === er.testId && t.tenantId === tenantId);
        if (!test || test.courseId !== courseId) return false;
      }
      return true;
    });
    const passed = examScoped.filter((er) => er.passed).length;
    const examTotal = examScoped.length;
    const examPassRate = examTotal === 0 ? 0 : passed / examTotal;

    const wantBreakdown =
      query.include_enrollment_breakdown === '1' || query.include_enrollment_breakdown === 'true';

    return {
      scope: {
        courseId: courseId ?? undefined,
        groupId: groupId ?? undefined,
        enrolledFrom: enrolledFrom ?? undefined,
        enrolledTo: enrolledTo ?? undefined
      },
      enrollmentsTotal: total,
      enrollmentsCompleted: completed,
      enrollmentCompletionRate: completionRate,
      examResultsInScopeTotal: examTotal,
      examResultsPassed: passed,
      examPassRate,
      ...(wantBreakdown
        ? {
            enrollmentBreakdown: scopedEnrollments.map((e) => ({
              enrollmentId: e.id,
              learnerId: e.learnerId,
              groupId: e.groupId,
              status: e.status,
              enrolledAt: e.enrolledAt
            }))
          }
        : {})
    };
  }

  getAnalyticsDashboard(tenantId: string, query: BaseFilterQuery): AnalyticsDashboardDto {
    const here = <T extends { tenantId: string }>(rows: T[]): T[] =>
      rows.filter((r) => r.tenantId === tenantId);
    return computeAnalyticsDashboard({
      enrollments: here(this.state.enrollments),
      examResults: here(this.state.examResults),
      groups: here(this.state.groups),
      groupCourses: here(this.state.groupCourses),
      courses: here(this.state.courses),
      tests: here(this.state.tests).map((t) => ({ id: t.id, courseId: t.courseId })),
      asOf: new Date().toISOString(),
      dropOffThresholdDays: 14,
      scope: {
        ...(query.course_id ? { courseId: query.course_id } : {}),
        ...(query.group_id ? { groupId: query.group_id } : {}),
        ...(query.client_id ? { clientId: query.client_id } : {}),
        ...((query.enrolled_from ?? query.created_from)
          ? { enrolledFrom: query.enrolled_from ?? query.created_from }
          : {}),
        ...((query.enrolled_to ?? query.created_to)
          ? { enrolledTo: query.enrolled_to ?? query.created_to }
          : {})
      }
    });
  }

  // ───────────────────────── Phase 10 Track A — Excel report builder ─────────────────────────

  /** Stateless XLSX writer (no DI deps) — kept off the constructor to leave its 6-arg shape intact. */
  private readonly reportXlsxWriter = new ReportXlsxWriter();

  /** Serialisable entity/field/filter registry for the UI. */
  getReportEntitiesMeta(): ReportEntitiesMetaDto {
    return { entities: listReportEntityMeta() };
  }

  previewReport(tenantId: string, req: BuildReportRequestDto): ReportPreviewDto {
    return this.runReport(tenantId, req, 50);
  }

  async exportReport(tenantId: string, req: BuildReportRequestDto): Promise<ReportExportDto> {
    const result = this.runReport(tenantId, req, 50_000);
    const buffer = await this.reportXlsxWriter.build(result.columns, result.rows);
    return {
      fileName: `report-${req.entityKey}-${tenantId.slice(0, 8)}.xlsx`,
      mimeType: this.reportXlsxWriter.contentType,
      contentBase64: buffer.toString('base64')
    };
  }

  listReportTemplates(tenantId: string): ReportTemplate[] {
    return this.state.reportTemplates.filter((t) => t.tenantId === tenantId);
  }

  getReportTemplate(tenantId: string, id: string): ReportTemplate {
    return this.getById(this.state.reportTemplates, tenantId, id);
  }

  saveReportTemplate(
    tenantId: string,
    req: SaveReportTemplateDto,
    context: RequestContext
  ): ReportTemplate {
    const filters = (req.filters ?? []).map((f) => ({ key: f.key, value: f.value }));
    if (req.id) {
      const current = this.getById(this.state.reportTemplates, tenantId, req.id);
      const oldValues = { ...current };
      current.name = req.name;
      current.entityKey = req.entityKey;
      current.selectedFields = [...req.selectedFields];
      current.filters = filters;
      current.updatedAt = this.now();
      this.audit(
        tenantId,
        context.userId,
        'reports.template_updated',
        'reports.template',
        current.id,
        oldValues,
        current,
        context
      );
      return current;
    }
    const entity: ReportTemplate = {
      id: this.id('rpt'),
      tenantId,
      status: 'active',
      name: req.name,
      entityKey: req.entityKey,
      selectedFields: [...req.selectedFields],
      filters,
      createdBy: context.userId,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.reportTemplates.push(entity);
    this.audit(
      tenantId,
      context.userId,
      'reports.template_created',
      'reports.template',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  deleteReportTemplate(tenantId: string, id: string, context: RequestContext): { id: string } {
    const current = this.getById(this.state.reportTemplates, tenantId, id);
    this.state.reportTemplates = this.state.reportTemplates.filter((t) => t.id !== current.id);
    this.audit(
      tenantId,
      context.userId,
      'reports.template_deleted',
      'reports.template',
      current.id,
      current,
      undefined,
      context
    );
    return { id: current.id };
  }

  /** Shared preview/export path: load tenant rows → run the pure engine, wrapping engine errors. */
  private runReport(
    tenantId: string,
    req: BuildReportRequestDto,
    limit: number
  ): {
    columns: ReportPreviewDto['columns'];
    rows: ReportPreviewDto['rows'];
    total: number;
    truncated: boolean;
  } {
    const entity = getEntity(req.entityKey);
    const rows = this.loadReportRows(tenantId, req.entityKey);
    try {
      return buildReport({
        entity,
        selectedFields: req.selectedFields,
        filters: (req.filters ?? []).map((f) => ({ key: f.key, value: f.value })),
        rows,
        ctx: this.buildReportResolveCtx(tenantId),
        limit
      });
    } catch (error) {
      throw new BadRequestException({
        code: 'validation_error',
        message: error instanceof Error ? error.message : 'invalid_report_request'
      });
    }
  }

  private loadReportRows(tenantId: string, entityKey: ReportEntityKey): unknown[] {
    const here = <T extends BaseEntity>(rows: T[]): T[] =>
      rows.filter((r) => r.tenantId === tenantId);
    switch (entityKey) {
      case 'learners':
        return here(this.state.learners);
      case 'enrollments':
        return here(this.state.enrollments);
      default:
        return [];
    }
  }

  private buildReportResolveCtx(tenantId: string): ResolveCtx {
    const here = <T extends BaseEntity>(rows: T[]): T[] =>
      rows.filter((r) => r.tenantId === tenantId);
    const fullName = (l: { lastName?: string; firstName?: string; middleName?: string }): string =>
      [l.lastName, l.firstName, l.middleName].filter((p) => p && p.length > 0).join(' ');
    return {
      courseTitleById: new Map(here(this.state.courses).map((c) => [c.id, c.title])),
      groupById: new Map(
        here(this.state.groups).map((g) => [
          g.id,
          { name: g.name, ...(g.counterpartyId ? { counterpartyId: g.counterpartyId } : {}) }
        ])
      ),
      clientNameById: new Map(here(this.state.counterparties).map((c) => [c.id, c.name])),
      learnerNameById: new Map(here(this.state.learners).map((l) => [l.id, fullName(l)])),
      courseProgressByEnrollment: new Map(
        here(this.state.courseProgress).map((p) => [p.enrollmentId, p.progressPercent])
      )
    };
  }

  getEnrollment(tenantId: string, id: string): Enrollment {
    return this.getById(this.state.enrollments, tenantId, id);
  }

  listEnrollmentCertificates(
    tenantId: string,
    enrollmentId: string,
    access?: MvpAssessmentReadAccess
  ): {
    items: Array<{
      id: string;
      documentType: string;
      name: string;
      downloadUrl: string;
    }>;
  } {
    const enrollment = this.getEnrollment(tenantId, enrollmentId);
    this.assertAssessmentReadAllowedForLearner(tenantId, enrollment.learnerId, access);
    const page = this.documentsService.listDocuments(tenantId, {
      documentType: 'certificate',
      sourceEntityType: 'enrollment',
      sourceEntityId: enrollmentId,
      pageSize: 200
    });
    const prefix = backendEnv.API_PREFIX.replace(/\/$/, '');
    return {
      items: page.items.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        name: d.name,
        downloadUrl: `${prefix}/files/${d.fileId}/download`
      }))
    };
  }

  /**
   * Phase 1 §4.3 — конец пути ученика: «закончил курс → увидел документы».
   *
   * В отличие от `listEnrollmentCertificates`, возвращает **все** типы документов
   * (certificate / diploma / attestation / reference / …), выпущенные через
   * `course_document_sets` (Pillar A §5.3). Скрывает архивные.
   *
   * Аннулированные (`status='revoked'`) возвращаем — учащийся должен видеть,
   * что документ был отозван, и причину (без расширенных полей в этом DTO).
   * Перевыпуск (`replacesDocumentId`) виден через ссылку на оригинал.
   *
   * `qrToken` отдаём — это публичная часть, ссылается на `/verify/[token]`
   * (см. PublicVerifyController) и нужна для UX «показать QR в кабинете».
   *
   * `downloadUrl` указывает на `/files/:id/download` (тот же путь, что у
   * админских certificates) — реальный stream PDF появится в Phase 5, когда
   * подключится document generation pipeline; до тех пор фронт показывает
   * stub-сообщение.
   */
  listEnrollmentDocuments(
    tenantId: string,
    enrollmentId: string,
    access?: MvpAssessmentReadAccess
  ): {
    items: LearnerDocumentDto[];
  } {
    const enrollment = this.getEnrollment(tenantId, enrollmentId);
    this.assertAssessmentReadAllowedForLearner(tenantId, enrollment.learnerId, access);
    const page = this.documentsService.listDocuments(tenantId, {
      sourceEntityType: 'enrollment',
      sourceEntityId: enrollmentId,
      pageSize: 200
    });
    const course = this.resolveEnrollmentCourse(tenantId, enrollment);
    const prefix = backendEnv.API_PREFIX.replace(/\/$/, '');
    return {
      items: page.items
        .filter((d) => d.status !== 'archived')
        .map((d) => mapDocumentToLearnerDto(d, prefix, enrollment.id, course.title, course.id))
    };
  }

  /**
   * Phase 1 §4.3 — агрегированный список документов для текущего IAM-пользователя.
   *
   * Поведение:
   * - Резолвит всех `learners` с `linkedIamUserId === actorId` в этом тенанте
   *   (учащийся может быть привязан к нескольким записям при миграции данных).
   * - Если ни один не привязан — возвращает пустой массив (НЕ 403): admin/teacher
   *   с `enrollments.read` без привязки видит просто пустоту здесь, отдельные
   *   админские роуты дают им полный доступ.
   * - Документы фильтруются как в `listEnrollmentDocuments` (без архивных).
   * - Сортировка — по дате выпуска (свежие сверху), затем по id.
   */
  listMyDocuments(
    tenantId: string,
    actorId: string | undefined
  ): {
    items: LearnerDocumentDto[];
  } {
    if (!actorId) {
      return { items: [] };
    }
    const learnerIds = this.resolveActorLearnerIds(tenantId, actorId);
    if (learnerIds.size === 0) {
      return { items: [] };
    }
    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && learnerIds.has(e.learnerId)
    );
    if (enrollments.length === 0) {
      return { items: [] };
    }
    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
    const courseByEnrollment = new Map(
      enrollments.map((e) => [e.id, this.resolveEnrollmentCourse(tenantId, e)])
    );
    const prefix = backendEnv.API_PREFIX.replace(/\/$/, '');
    const page = this.documentsService.listDocuments(tenantId, {
      sourceEntityType: 'enrollment',
      pageSize: 1000
    });
    const items = page.items
      .filter((d) => d.status !== 'archived')
      .filter((d) => d.sourceEntityId !== undefined && enrollmentById.has(d.sourceEntityId))
      .map((d) => {
        const enrollmentId = d.sourceEntityId as string;
        const course = courseByEnrollment.get(enrollmentId) ?? { id: undefined, title: '' };
        return mapDocumentToLearnerDto(d, prefix, enrollmentId, course.title, course.id);
      })
      .sort((a, b) => {
        const aKey = a.documentDate ?? '';
        const bKey = b.documentDate ?? '';
        if (aKey !== bKey) return bKey.localeCompare(aKey);
        return b.id.localeCompare(a.id);
      });
    return { items };
  }

  private resolveGroupCourseTitle(tenantId: string, groupId: string): string | undefined {
    const groupCourse = this.state.groupCourses.find(
      (gc) => gc.tenantId === tenantId && gc.groupId === groupId
    );
    if (groupCourse) {
      const course = this.state.courses.find(
        (c) => c.tenantId === tenantId && c.id === groupCourse.courseId
      );
      if (course?.title) return course.title;
    }
    const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
    return group?.name;
  }

  private resolveEnrollmentCourse(
    tenantId: string,
    enrollment: Enrollment
  ): { id?: string; title: string } {
    // Enrollment связан с курсом через groupCourse (group -> course).
    const groupCourse = this.state.groupCourses.find(
      (gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId
    );
    if (!groupCourse) return { title: '' };
    const course = this.state.courses.find(
      (c) => c.tenantId === tenantId && c.id === groupCourse.courseId
    );
    if (!course) return { title: '' };
    return { id: course.id, title: course.title };
  }

  createEnrollment(
    tenantId: string,
    actorId: string | undefined,
    request: CreateEnrollmentRequest,
    context: RequestContext
  ): Enrollment {
    this.getById(this.state.groups, tenantId, request.groupId);
    this.getById(this.state.learners, tenantId, request.learnerId);
    const duplicate = this.state.enrollments.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === request.groupId &&
        item.learnerId === request.learnerId
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Enrollment already exists for pair(group, learner)'
      });
    }
    const now = this.now();
    const entity: Enrollment = {
      id: this.id('enrollment'),
      tenantId,
      groupId: request.groupId,
      learnerId: request.learnerId,
      status: 'pending',
      enrolledAt: now,
      plannedEndAt: this.computePlannedEndAt(tenantId, request.groupId, now),
      createdAt: now,
      updatedAt: now
    };
    this.state.enrollments.push(entity);
    this.pushEnrollmentStatusHistory(tenantId, entity.id, entity.status, undefined);
    this.audit(
      tenantId,
      actorId,
      'learning.enrollment_created',
      'learning.enrollment',
      entity.id,
      undefined,
      entity,
      context
    );
    const invitedRecipient = learnerRecipient(
      this.state.learners.find((l) => l.tenantId === tenantId && l.id === entity.learnerId)
    );
    const courseTitle = this.resolveGroupCourseTitle(tenantId, entity.groupId);
    this.events.emit(ENROLLMENT_INVITED_EVENT, {
      tenantId,
      enrollmentId: entity.id,
      learnerId: entity.learnerId,
      groupId: entity.groupId,
      ...(invitedRecipient ? { recipient: invitedRecipient } : {}),
      ...(courseTitle ? { courseTitle } : {}),
      actorId,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return entity;
  }

  getBulkEnrollmentOutcomeIfAny(
    tenantId: string,
    idempotencyKey: string
  ): BulkEnrollmentsOutcome | undefined {
    const rec = this.state.bulkEnrollmentIdempotency.find(
      (r) => r.tenantId === tenantId && r.idempotencyKey === idempotencyKey
    );
    return rec?.outcome;
  }

  /** Phase 2 Plan A — idempotency lookup для bulk-import учеников. */
  getBulkImportOutcomeIfAny(
    tenantId: string,
    idempotencyKey: string
  ): BulkImportOutcome | undefined {
    const rec = this.state.bulkImportIdempotency.find(
      (r) => r.tenantId === tenantId && r.idempotencyKey === idempotencyKey
    );
    return rec?.outcome;
  }

  /** Phase 2 Plan A — сохранение outcome bulk-import в idempotency store. */
  saveBulkImportOutcome(
    tenantId: string,
    idempotencyKey: string,
    outcome: BulkImportOutcome
  ): void {
    this.state.bulkImportIdempotency.push({
      tenantId,
      idempotencyKey,
      outcome,
      createdAt: this.now()
    });
  }

  createBulkEnrollments(
    tenantId: string,
    actorId: string | undefined,
    request: CreateBulkEnrollmentsRequest,
    context: RequestContext
  ): BulkEnrollmentsOutcome {
    const duplicateIdem = this.state.bulkEnrollmentIdempotency.find(
      (r) => r.tenantId === tenantId && r.idempotencyKey === request.idempotencyKey
    );
    if (duplicateIdem) {
      return duplicateIdem.outcome;
    }

    const explicit = (request.learnerIds ?? [])
      .map((lid) => String(lid).trim())
      .filter((id) => id.length > 0);

    const orgKey = request.organizationUnitId?.trim();
    let fromOrg: string[] = [];
    if (orgKey) {
      fromOrg = this.state.learners
        .filter((l) => l.tenantId === tenantId && l.organizationUnitId === orgKey)
        .map((l) => l.id);
    }

    const uniqueLearnerIds = [...new Set([...explicit, ...fromOrg])];

    if (uniqueLearnerIds.length === 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message:
          'No learner targets resolved: provide non-empty learnerIds and/or organizationUnitId with matching learners'
      });
    }
    const created: Enrollment[] = [];
    const skippedExisting: Array<{ learnerId: string; enrollmentId: string }> = [];
    const errors: BulkEnrollmentItemError[] = [];

    for (const learnerId of uniqueLearnerIds) {
      try {
        const entity = this.createEnrollment(
          tenantId,
          actorId,
          { groupId: request.groupId, learnerId },
          context
        );
        created.push(entity);
      } catch (err: unknown) {
        if (err instanceof ConflictException) {
          const dup = this.state.enrollments.find(
            (item) =>
              item.tenantId === tenantId &&
              item.groupId === request.groupId &&
              item.learnerId === learnerId
          );
          if (dup) skippedExisting.push({ learnerId, enrollmentId: dup.id });
          else
            errors.push({
              learnerId,
              code: 'conflict',
              message: 'Enrollment conflict without matching existing row'
            });
          continue;
        }
        if (err instanceof NotFoundException) {
          errors.push({
            learnerId,
            code: 'not_found',
            message: err instanceof Error ? err.message : String(err)
          });
          continue;
        }
        throw err;
      }
    }

    const outcome: BulkEnrollmentsOutcome = {
      idempotencyKey: request.idempotencyKey,
      groupId: request.groupId,
      created,
      skippedExisting,
      errors
    };
    this.state.bulkEnrollmentIdempotency.push({
      id: this.id('bulkidem'),
      tenantId,
      idempotencyKey: request.idempotencyKey,
      outcome,
      createdAt: this.now()
    });
    this.audit(
      tenantId,
      actorId,
      'learning.enrollments_bulk',
      'learning.group',
      request.groupId,
      undefined,
      {
        idempotencyKey: request.idempotencyKey,
        requestedLearners: uniqueLearnerIds.length,
        createdCount: created.length,
        skippedCount: skippedExisting.length,
        errorCount: errors.length
      },
      context
    );
    return outcome;
  }

  changeEnrollmentStatus(
    tenantId: string,
    actorId: string | undefined,
    enrollmentId: string,
    request: UpdateEnrollmentStatusRequest,
    context: RequestContext
  ): Enrollment {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    const allowed = this.canTransitionEnrollment(enrollment.status, request.status);
    if (!allowed) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: `Transition ${enrollment.status} -> ${request.status} is not allowed`
      });
    }
    const oldValues = { ...enrollment };
    enrollment.status = request.status;
    enrollment.updatedAt = this.now();
    enrollment.completedAt = request.status === 'completed' ? this.now() : enrollment.completedAt;
    this.pushEnrollmentStatusHistory(tenantId, enrollment.id, request.status, request.reason);
    this.audit(
      tenantId,
      actorId,
      'learning.enrollment_status_changed',
      'learning.enrollment',
      enrollment.id,
      oldValues,
      enrollment,
      context
    );
    if (request.status === 'completed') {
      const groupCourses = this.state.groupCourses.filter(
        (gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId
      );
      const courseIds = groupCourses.map((gc) => gc.courseId);
      const documentSet = groupCourses
        .filter((gc) => gc.courseVersionId)
        .flatMap((gc) => {
          const version = this.getCourseVersion(tenantId, gc.courseVersionId as string);
          return this.getCourseDocumentSet(tenantId, gc.courseVersionId as string).map((entry) => ({
            courseVersionId: gc.courseVersionId as string,
            templateId: entry.templateId,
            position: entry.position,
            isRequired: entry.isRequired,
            autoIssueOnCompletion: entry.autoIssueOnCompletion,
            ...(version.recertificationPeriodMonths
              ? { recertificationPeriodMonths: version.recertificationPeriodMonths }
              : {})
          }));
        });
      const completedRecipient = learnerRecipient(
        this.state.learners.find((l) => l.tenantId === tenantId && l.id === enrollment.learnerId)
      );
      const completedCourseTitle = this.resolveGroupCourseTitle(tenantId, enrollment.groupId);
      this.events.emit(ENROLLMENT_COMPLETED_EVENT, {
        tenantId,
        enrollmentId: enrollment.id,
        learnerId: enrollment.learnerId,
        groupId: enrollment.groupId,
        groupCourseIds: courseIds,
        actorId,
        requestId: context.requestId,
        correlationId: context.correlationId,
        documentSet,
        ...(completedRecipient ? { recipient: completedRecipient } : {}),
        ...(enrollment.completedAt ? { completedAt: enrollment.completedAt } : {}),
        ...(completedCourseTitle ? { courseTitle: completedCourseTitle } : {})
      });
    }
    return enrollment;
  }

  listProgress(tenantId: string, query: BaseFilterQuery): ListResponse<CourseProgress> {
    return this.list(this.state.courseProgress, tenantId, query);
  }

  getProgress(tenantId: string, id: string): CourseProgress {
    return this.getById(this.state.courseProgress, tenantId, id);
  }

  listEnrollmentStatusHistory(tenantId: string, enrollmentId: string): EnrollmentStatusHistory[] {
    return this.state.enrollmentStatusHistory.filter(
      (item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId
    );
  }

  upsertMaterialProgress(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    request: UpdateMaterialProgressRequest,
    context: RequestContext,
    options?: { allowScormCompletion?: boolean }
  ): MaterialProgress {
    const material = this.getById(this.state.materials, tenantId, materialId);
    const moduleEntity = this.getById(this.state.modules, tenantId, material.moduleId);
    const courseVersion = this.getById(
      this.state.courseVersions,
      tenantId,
      moduleEntity.courseVersionId
    );

    const enrollment = this.state.enrollments.find(
      (item) => item.tenantId === tenantId && item.id === request.enrollmentId
    );
    if (!enrollment) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Enrollment not found for progress update'
      });
    }
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === courseVersion.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the course for this material'
      });
    }

    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );

    if (request.studiedSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'studied_seconds must be non-negative'
      });
    }

    const now = this.now();
    const requiredSeconds = material.minViewSeconds;
    const existing = this.state.materialProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.materialId === materialId &&
        item.enrollmentId === enrollment.id
    );

    const studiedSeconds = Math.max(0, request.studiedSeconds);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    let percent = this.normalizePercent(ratio * 100);
    let status: ProgressStatus =
      percent >= 100 ? 'completed' : percent > 0 ? 'in_progress' : 'not_started';

    // Defense-in-depth: SCORM completion must come exclusively via commitScormAttempt.
    // The generic progress endpoint (watch-tracker) must never mark a SCORM material
    // completed — the SCO lesson_status reported by the SCORM player is the only valid
    // completion signal. Block it here unless the caller explicitly opts in.
    if (material.materialType === 'scorm' && options?.allowScormCompletion !== true) {
      if (status === 'completed') {
        status = 'in_progress';
        percent = Math.min(percent, 99);
      }
    }

    const record: MaterialProgress = existing ?? {
      id: this.id('mp'),
      tenantId,
      enrollmentId: enrollment.id,
      courseId: courseVersion.courseId,
      moduleId: moduleEntity.id,
      materialId,
      status,
      studiedSeconds,
      requiredSeconds,
      progressPercent: percent,
      createdAt: now,
      updatedAt: now
    };

    record.studiedSeconds = studiedSeconds;
    record.requiredSeconds = requiredSeconds;
    record.progressPercent = percent;
    record.status = status;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;

    if (!existing) this.state.materialProgress.push(record);

    this.recalculateModuleProgress(
      tenantId,
      enrollment.id,
      moduleEntity.id,
      courseVersion.courseId
    );
    this.recalculateCourseProgress(tenantId, enrollment.id, courseVersion.courseId);

    this.audit(
      tenantId,
      actorId,
      'learning.progress_updated',
      'learning.material_progress',
      record.id,
      undefined,
      record,
      context,
      delegationAuditMetadata
    );
    return record;
  }

  private recalculateModuleProgress(
    tenantId: string,
    enrollmentId: string,
    moduleId: string,
    courseId: string
  ): void {
    const moduleMaterials = this.state.materialProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const requiredSeconds = moduleMaterials.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleMaterials.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
    const status: ProgressStatus =
      progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.state.moduleProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const record: ModuleProgress = existing ?? {
      id: this.id('modp'),
      tenantId,
      enrollmentId,
      courseId,
      moduleId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.moduleProgress.push(record);
  }

  private recalculateCourseProgress(
    tenantId: string,
    enrollmentId: string,
    courseId: string
  ): void {
    const moduleProgress = this.state.moduleProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const requiredSeconds = moduleProgress.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleProgress.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
    const status: ProgressStatus =
      progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.state.courseProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const record: CourseProgress = existing ?? {
      id: this.id('cpg'),
      tenantId,
      enrollmentId,
      courseId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.courseProgress.push(record);
  }

  listQuestionBanks(tenantId: string, query: BaseFilterQuery): ListResponse<QuestionBank> {
    return this.list(this.state.questionBanks, tenantId, query);
  }
  getQuestionBank(tenantId: string, id: string): QuestionBank {
    return this.getById(this.state.questionBanks, tenantId, id);
  }
  createQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    request: CreateQuestionBankRequest,
    context: RequestContext
  ): QuestionBank {
    const entity: QuestionBank = {
      id: this.id('qbank'),
      tenantId,
      code: request.code,
      title: request.title,
      description: request.description,
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.questionBanks.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_created',
      'assessment.question_bank',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateQuestionBankRequest,
    context: RequestContext
  ): QuestionBank {
    const current = this.getById(this.state.questionBanks, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_updated',
      'assessment.question_bank',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  archiveQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): QuestionBank {
    const current = this.getById(this.state.questionBanks, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_archived',
      'assessment.question_bank',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }

  listQuestions(tenantId: string, query: BaseFilterQuery): ListResponse<Question> {
    return this.list(this.state.questions, tenantId, query);
  }
  getQuestion(tenantId: string, id: string): Question {
    return this.getById(this.state.questions, tenantId, id);
  }
  listQuestionBankQuestions(
    tenantId: string,
    questionBankId: string,
    query: BaseFilterQuery
  ): ListResponse<Question> {
    this.getById(this.state.questionBanks, tenantId, questionBankId);
    return this.list(
      this.state.questions.filter((item) => item.questionBankId === questionBankId),
      tenantId,
      query
    );
  }
  createQuestion(
    tenantId: string,
    actorId: string | undefined,
    request: CreateQuestionRequest,
    context: RequestContext
  ): Question {
    this.getById(this.state.questionBanks, tenantId, request.questionBankId);
    const title =
      (request as unknown as { title?: string; text?: string }).title ??
      (request as unknown as { text?: string }).text ??
      '';
    const body =
      (request as unknown as { body?: string; text?: string }).body ??
      (request as unknown as { text?: string }).text;
    const score = (request as unknown as { score?: number }).score ?? 1;
    const entity: Question = {
      id: this.id('q'),
      tenantId,
      questionBankId: request.questionBankId,
      type: request.type,
      title,
      body,
      score,
      isArchived: false,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now(),
      ...(request.numericExpected !== undefined
        ? { numericExpected: request.numericExpected }
        : {}),
      ...(request.numericTolerance !== undefined
        ? { numericTolerance: request.numericTolerance }
        : {}),
      ...(request.expectedAnswer !== undefined ? { expectedAnswer: request.expectedAnswer } : {}),
      ...(request.tags !== undefined ? { tags: request.tags } : {})
    };
    this.state.questions.push(entity);
    const options =
      (
        request as unknown as {
          answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
          options?: Array<{ text: string; isCorrect?: boolean }>;
        }
      ).answerOptions ??
      (request as unknown as { options?: Array<{ text: string; isCorrect?: boolean }> }).options;
    if (options?.length) {
      options.forEach((option, idx) =>
        this.state.answerOptions.push({
          id: this.id('opt'),
          tenantId,
          questionId: entity.id,
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
          sortOrder: idx,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        })
      );
    }
    this.audit(
      tenantId,
      actorId,
      'assessment.question_created',
      'assessment.question',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateQuestion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateQuestionRequest,
    context: RequestContext
  ): Question {
    const current = this.getById(this.state.questions, tenantId, id);
    if (current.isArchived)
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Archived question is read-only'
      });
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    const answerOptions =
      (
        request as unknown as {
          answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
          options?: Array<{ text: string; isCorrect?: boolean }>;
        }
      ).answerOptions ??
      (request as unknown as { options?: Array<{ text: string; isCorrect?: boolean }> }).options;
    if (answerOptions) {
      this.state.answerOptions = this.state.answerOptions.filter(
        (item) => !(item.tenantId === tenantId && item.questionId === id)
      );
      answerOptions.forEach((option, idx) =>
        this.state.answerOptions.push({
          id: this.id('opt'),
          tenantId,
          questionId: id,
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
          sortOrder: idx,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        })
      );
    }
    this.audit(
      tenantId,
      actorId,
      'assessment.question_updated',
      'assessment.question',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  archiveQuestion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Question {
    const current = this.getById(this.state.questions, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.question_archived',
      'assessment.question',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }

  listTests(tenantId: string, query: BaseFilterQuery): ListResponse<TestEntity> {
    return this.list(this.state.tests, tenantId, query);
  }
  getTest(tenantId: string, id: string): TestEntity {
    return this.getById(this.state.tests, tenantId, id);
  }
  createTest(
    tenantId: string,
    actorId: string | undefined,
    request: CreateTestRequest,
    context: RequestContext
  ): TestEntity {
    this.getById(this.state.courses, tenantId, request.courseId);
    const entity: TestEntity = {
      id: this.id('test'),
      tenantId,
      courseId: request.courseId,
      moduleId: request.moduleId,
      title: request.title,
      description: request.description,
      questionBankId: request.questionBankId,
      rules: this.normalizeTestRules(request.rules),
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.tests.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.test_created',
      'assessment.test',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateTestRequest,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.test_updated',
      'assessment.test',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  publishTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    if (current.status === 'published') return current;
    const attached = this.state.testQuestions.filter(
      (item) => item.tenantId === tenantId && item.testId === id
    );
    if (attached.length === 0) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Cannot publish a test without questions'
      });
    }
    current.status = 'published';
    current.publishedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_published',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  archiveTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    if (current.isArchived) return current;
    current.status = 'archived';
    current.isArchived = true;
    current.archivedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_archived',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  patchTestRules(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: PatchTestRulesRequest,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    current.rules = this.normalizeTestRules(request);
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_rules_updated',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  listTestQuestions(tenantId: string, testId: string): TestQuestion[] {
    this.getById(this.state.tests, tenantId, testId);
    return this.state.testQuestions.filter(
      (item) => item.tenantId === tenantId && item.testId === testId
    );
  }
  addTestQuestions(
    tenantId: string,
    actorIdOrTestId: string | undefined,
    testIdOrQuestionIds: string | string[],
    questionIdsOrContext?: string[] | RequestContext,
    maybeContext?: RequestContext
  ): TestQuestion[] {
    let actorId: string | undefined;
    let testId: string;
    let questionIds: string[];
    let context: RequestContext | undefined;

    if (Array.isArray(testIdOrQuestionIds)) {
      actorId = undefined;
      testId = actorIdOrTestId ?? '';
      questionIds = testIdOrQuestionIds;
      context = undefined;
    } else {
      actorId = actorIdOrTestId;
      testId = testIdOrQuestionIds;
      questionIds = Array.isArray(questionIdsOrContext) ? questionIdsOrContext : [];
      context = Array.isArray(questionIdsOrContext) ? maybeContext : questionIdsOrContext;
    }

    this.getById(this.state.tests, tenantId, testId);
    questionIds.forEach((questionId) => this.getById(this.state.questions, tenantId, questionId));
    questionIds.forEach((questionId) => {
      if (
        !this.state.testQuestions.some(
          (item) =>
            item.tenantId === tenantId && item.testId === testId && item.questionId === questionId
        )
      ) {
        this.state.testQuestions.push({
          id: this.id('tq'),
          tenantId,
          testId,
          questionId,
          sortOrder: this.state.testQuestions.length,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        });
      }
    });
    if (context) {
      this.audit(
        tenantId,
        actorId,
        'assessment.test_questions_attached',
        'assessment.test',
        testId,
        undefined,
        { testId, questionIds },
        context
      );
    }
    return this.listTestQuestions(tenantId, testId);
  }

  /**
   * Phase 3 Plan A: добавление одного вопроса в тест с опциональным sortOrder.
   * Если вопрос уже привязан — возвращает существующую связь (идемпотентно, без audit).
   * Если sortOrder не передан — кладёт в конец (max + 1 для этого теста, либо 0).
   */
  addTestQuestion(
    tenantId: string,
    actorId: string | undefined,
    testId: string,
    questionId: string,
    sortOrder: number | undefined,
    context: RequestContext
  ): TestQuestion {
    this.getById(this.state.tests, tenantId, testId);
    this.getById(this.state.questions, tenantId, questionId);
    const existing = this.state.testQuestions.find(
      (item) =>
        item.tenantId === tenantId && item.testId === testId && item.questionId === questionId
    );
    if (existing) return existing;
    const peers = this.state.testQuestions.filter(
      (item) => item.tenantId === tenantId && item.testId === testId
    );
    const resolvedSortOrder =
      sortOrder ?? (peers.length === 0 ? 0 : Math.max(...peers.map((p) => p.sortOrder)) + 1);
    const entity: TestQuestion = {
      id: this.id('tq'),
      tenantId,
      testId,
      questionId,
      sortOrder: resolvedSortOrder,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.testQuestions.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.test_question_added',
      'assessment.test_question',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  /**
   * Phase 3 Plan A: idempotent удаление test→question связи. Если связь отсутствует — no-op, без audit.
   */
  removeTestQuestion(
    tenantId: string,
    actorId: string | undefined,
    testId: string,
    questionId: string,
    context: RequestContext
  ): void {
    const index = this.state.testQuestions.findIndex(
      (item) =>
        item.tenantId === tenantId && item.testId === testId && item.questionId === questionId
    );
    if (index < 0) return;
    const [removed] = this.state.testQuestions.splice(index, 1);
    if (!removed) return;
    this.audit(
      tenantId,
      actorId,
      'assessment.test_question_removed',
      'assessment.test_question',
      removed.id,
      removed,
      undefined,
      context
    );
  }

  /**
   * Phase 3 Plan A: смена sortOrder для существующей test→question связи.
   * Не пытается «уплотнить» соседей — UI вызывает по одному при drag-and-drop.
   */
  reorderTestQuestion(
    tenantId: string,
    actorId: string | undefined,
    testId: string,
    questionId: string,
    newSortOrder: number,
    context: RequestContext
  ): TestQuestion {
    const tq = this.state.testQuestions.find(
      (item) =>
        item.tenantId === tenantId && item.testId === testId && item.questionId === questionId
    );
    if (!tq) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Test question link not found'
      });
    }
    const previous = tq.sortOrder;
    tq.sortOrder = newSortOrder;
    tq.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_question_reordered',
      'assessment.test_question',
      tq.id,
      { sortOrder: previous },
      { sortOrder: newSortOrder },
      context
    );
    return tq;
  }

  /**
   * Phase 3 Plan A: read-only reviewer queue — обёртка над pure-aggregator. См.
   * reviewer-queue.service.ts для логики фильтрации. Plans B+C наполнят attempts /
   * submissions; пока пустая обёртка.
   */
  async getReviewerQueue(
    tenantId: string,
    _context: RequestContext
  ): Promise<ReviewerQueueSnapshot> {
    const snapshot = aggregateReviewerQueue(
      {
        testAttempts: this.state.attempts as TestAttempt[],
        attemptAnswers: this.state.attemptAnswers,
        assignmentSubmissions: this.state.assignmentSubmissions,
        questions: this.state.questions
      },
      { tenantId }
    );
    // V1.1 AV gate: surface each submission file's antivirus status so the reviewer UI can
    // gate the "Скачать файл" button. Batch lookup avoids N+1 across the queue.
    const submissionFileIds = snapshot.pendingSubmissions
      .map((s) => s.fileId)
      .filter((id): id is string => Boolean(id));
    const statusMap = await this.filesService.getAntivirusStatuses(tenantId, submissionFileIds);
    return {
      pendingAttempts: snapshot.pendingAttempts,
      pendingSubmissions: snapshot.pendingSubmissions.map((s) => ({
        ...s,
        antivirusStatus: s.fileId ? (statusMap.get(s.fileId) ?? null) : null
      }))
    };
  }

  listAttempts(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<TestAttempt> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.attempts
        : this.state.attempts.filter((a) => a.tenantId === tenantId && scope.includes(a.learnerId));
    return this.list(source, tenantId, query);
  }
  getAttempt(tenantId: string, id: string, access?: MvpAssessmentReadAccess): TestAttempt {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, attempt.learnerId, access);
    return attempt;
  }
  getAttemptQuestions(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    context: RequestContext
  ): AttemptQuestionView[] {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      attempt.learnerId,
      context.permissions
    );
    const answers = this.state.attemptAnswers.filter(
      (item) => item.tenantId === tenantId && item.attemptId === attempt.id
    );
    return attempt.questionOrder.map((qid) => {
      const question = this.getById(this.state.questions, tenantId, qid);
      const options = this.state.answerOptions
        .filter((item) => item.tenantId === tenantId && item.questionId === qid)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({ id: item.id, text: item.text, sortOrder: item.sortOrder }));
      const answer = answers.find((item) => item.questionId === qid);
      const selectedOptionIds = answer?.selectedOptionIds ?? answer?.answerOptionIds;
      return {
        id: question.id,
        type: question.type,
        title: question.title,
        ...(question.body !== undefined ? { body: question.body } : {}),
        score: question.score,
        options,
        ...(selectedOptionIds !== undefined ? { selectedOptionIds } : {}),
        ...(answer?.textAnswer !== undefined ? { textAnswer: answer.textAnswer } : {})
      };
    });
  }
  /**
   * Агрегированный список тестов для текущего IAM-актора (учащийся).
   * Зеркалит конвенцию `listMyDocuments`: сервис сам резолвит всех learner-ов,
   * привязанных к актору (`linkedIamUserId`), и возвращает пустой массив (НЕ 403),
   * если привязок нет — admin/teacher с `assessment.tests.read` без привязки видит
   * просто пустоту здесь.
   */
  listMyTests(tenantId: string, actorId: string | undefined): LearnerTestSummary[] {
    if (!actorId) return [];
    const learnerIds = this.resolveActorLearnerIds(tenantId, actorId);
    if (learnerIds.size === 0) return [];
    const enrollments = this.state.enrollments.filter(
      (item) => item.tenantId === tenantId && learnerIds.has(item.learnerId)
    );
    const summaries: LearnerTestSummary[] = [];
    for (const enrollment of enrollments) {
      const courseIds = this.state.groupCourses
        .filter((item) => item.tenantId === tenantId && item.groupId === enrollment.groupId)
        .map((item) => item.courseId);
      const tests = this.state.tests.filter(
        (item) =>
          item.tenantId === tenantId && !item.isArchived && courseIds.includes(item.courseId)
      );
      for (const test of tests) {
        const attempts = this.state.attempts.filter(
          (item) =>
            item.tenantId === tenantId &&
            item.testId === test.id &&
            item.enrollmentId === enrollment.id &&
            learnerIds.has(item.learnerId)
        );
        const maxScore = this.listTestQuestions(tenantId, test.id).reduce(
          (acc, link) => acc + this.getById(this.state.questions, tenantId, link.questionId).score,
          0
        );
        const scored = attempts.filter((item) => item.score !== undefined);
        const bestScore = scored.length
          ? Math.max(...scored.map((item) => item.score ?? 0))
          : undefined;
        const activeAttemptId = attempts.find(
          (item) => item.status === 'draft' || item.status === 'in_progress'
        )?.id;
        summaries.push({
          testId: test.id,
          title: test.title,
          courseId: test.courseId,
          enrollmentId: enrollment.id,
          learnerId: enrollment.learnerId,
          status: this.deriveLearnerTestStatus(attempts, test.rules.attemptLimit),
          attemptsUsed: attempts.length,
          attemptLimit: test.rules.attemptLimit,
          ...(activeAttemptId !== undefined ? { activeAttemptId } : {}),
          ...(bestScore !== undefined ? { bestScore } : {}),
          maxScore
        });
      }
    }
    return summaries;
  }
  /**
   * Phase 3 Plan C — aggregated list of assignments for the current IAM actor (learner).
   * Mirrors `listMyTests`: resolves linked learner(s) inline by `linkedIamUserId`,
   * returns [] (NOT 403) when the actor has no linked learner.
   */
  listMyAssignments(tenantId: string, actorId: string | undefined): LearnerAssignmentSummary[] {
    if (!actorId) return [];
    const learnerIds = this.resolveActorLearnerIds(tenantId, actorId);
    if (learnerIds.size === 0) return [];
    const enrollments = this.state.enrollments.filter(
      (item) => item.tenantId === tenantId && learnerIds.has(item.learnerId)
    );
    const summaries: LearnerAssignmentSummary[] = [];
    for (const enrollment of enrollments) {
      const courseIds = this.state.groupCourses
        .filter((item) => item.tenantId === tenantId && item.groupId === enrollment.groupId)
        .map((item) => item.courseId);
      const assignments = this.state.assignments.filter(
        (item) =>
          item.tenantId === tenantId && !item.isArchived && courseIds.includes(item.courseId)
      );
      for (const assignment of assignments) {
        const submission = this.state.assignmentSubmissions.find(
          (s) =>
            s.tenantId === tenantId &&
            s.assignmentId === assignment.id &&
            s.enrollmentId === enrollment.id &&
            learnerIds.has(s.learnerId)
        );
        summaries.push({
          assignmentId: assignment.id,
          title: assignment.title,
          courseId: assignment.courseId,
          enrollmentId: enrollment.id,
          learnerId: enrollment.learnerId,
          maxScore: assignment.maxScore,
          status: submission?.status ?? 'not_started',
          ...(submission?.id !== undefined ? { submissionId: submission.id } : {}),
          ...(submission?.returnComment !== undefined
            ? { returnComment: submission.returnComment }
            : {})
        });
      }
    }
    return summaries;
  }
  private deriveLearnerTestStatus(
    attempts: TestAttempt[],
    attemptLimit: number
  ): LearnerTestSummary['status'] {
    if (attempts.length === 0) return 'not_started';
    if (attempts.some((item) => item.status === 'draft' || item.status === 'in_progress'))
      return 'in_progress';
    if (attempts.some((item) => item.passed === true)) return 'passed';
    if (attempts.length >= attemptLimit) return 'failed';
    return 'submitted';
  }
  startAttempt(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): TestAttempt {
    const test = this.getById(this.state.tests, tenantId, request.testId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === test.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the test course'
      });
    }
    const claimedLearner = request.learnerId?.trim();
    if (!claimedLearner) {
      throw new BadRequestException({ code: 'validation_error', message: 'learnerId is required' });
    }
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    // Wave 1 gates: последовательность модулей (A), минимальное время (B), аутентификация (C).
    this.assertModuleSequenceGate(tenantId, enrollment.id, test);
    this.assertMinViewGate(tenantId, enrollment.id, test);
    this.assertPreExamAuthGate(tenantId, enrollment, test);
    // Phase 4 Plan A: documentary identity (selfie+passport) — per-learner.
    this.assertIdentityVerificationGate(tenantId, enrollment, test);
    // Phase 4 Plan B: webcam recording must be running for proctored finals.
    this.assertProctoringGate(tenantId, enrollment, test);
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );

    const learnerId = enrollment.learnerId;
    const now = new Date(this.now());
    const dayKey = now.toISOString().slice(0, 10);
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId && item.testId === request.testId && item.learnerId === learnerId
    );
    const bounded = test.rules.dailyResetEnabled
      ? attempts.filter((item) => item.startedAt.slice(0, 10) === dayKey)
      : attempts;
    if (bounded.length >= test.rules.attemptLimit)
      throw new PreconditionFailedException({
        code: 'attempt_limit_reached',
        message: 'Attempt limit reached'
      });
    const questionPool = this.listTestQuestions(tenantId, request.testId).map(
      (item) => item.questionId
    );
    const ordered = [...questionPool];
    if (test.rules.randomizeQuestions) ordered.sort(() => Math.random() - 0.5);
    const snapshot = test.rules.questionCount
      ? ordered.slice(0, test.rules.questionCount)
      : ordered;
    const maxScore = snapshot.reduce(
      (acc, questionId) => acc + this.getById(this.state.questions, tenantId, questionId).score,
      0
    );
    const startedAt = now.toISOString();
    const expiresAt = test.rules.timeLimitMinutes
      ? new Date(now.getTime() + test.rules.timeLimitMinutes * 60000).toISOString()
      : undefined;
    const verification = this.findPreExamVerification(tenantId, enrollment.id, test.id);
    const entity: TestAttempt = {
      id: this.id('attempt'),
      tenantId,
      testId: request.testId,
      enrollmentId: request.enrollmentId,
      learnerId,
      attemptNo: attempts.length + 1,
      status: 'in_progress',
      startedAt,
      expiresAt,
      score: 0,
      maxScore,
      questionOrder: snapshot,
      createdAt: startedAt,
      updatedAt: startedAt,
      ...(verification
        ? {
            identityVerifiedAt: verification.consumedAt,
            identityVerificationTokenId: verification.id
          }
        : {})
    };
    this.state.attempts.push(entity);
    // Phase 4 Plan B: link the running recording session to its (first) attempt.
    // Re-querying is stable here: same synchronous call, request-scoped state. If lookups ever
    // become async (per-row Postgres reads), pass the recording from assertProctoringGate instead.
    const activeProctoringRecording = this.findActiveProctoringRecording(
      tenantId,
      learnerId,
      enrollment.groupId,
      test.courseId
    );
    if (activeProctoringRecording && !activeProctoringRecording.attemptId) {
      activeProctoringRecording.attemptId = entity.id;
      activeProctoringRecording.updatedAt = startedAt;
    }
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_started',
      'assessment.test_attempt',
      entity.id,
      undefined,
      entity,
      context,
      delegationAuditMetadata
    );
    return entity;
  }

  /** The intermediate (gating) test of a module, if any. */
  private getModuleGatingTest(tenantId: string, moduleId: string): TestEntity | undefined {
    return this.state.tests.find(
      (t) => t.tenantId === tenantId && t.moduleId === moduleId && !t.isArchived
    );
  }

  /** Whether the learner already has a passing ExamResult for the given test. */
  private isExamPassed(tenantId: string, enrollmentId: string, testId: string): boolean {
    return this.state.examResults.some(
      (er) =>
        er.tenantId === tenantId &&
        er.enrollmentId === enrollmentId &&
        er.testId === testId &&
        er.passed === true
    );
  }

  /** Required modules that must be passed before the given test can start. */
  private requiredPriorModules(tenantId: string, test: TestEntity): CourseModuleEntity[] {
    if (test.moduleId) {
      const current = this.getById(this.state.modules, tenantId, test.moduleId);
      return this.state.modules.filter(
        (m) =>
          m.tenantId === tenantId &&
          m.courseVersionId === current.courseVersionId &&
          m.isRequired &&
          m.sortOrder < current.sortOrder
      );
    }
    // Final/course-level exam: all required modules of the course must be passed.
    const versionIds = this.state.courseVersions
      .filter((v) => v.tenantId === tenantId && v.courseId === test.courseId)
      .map((v) => v.id);
    return this.state.modules.filter(
      (m) => m.tenantId === tenantId && versionIds.includes(m.courseVersionId) && m.isRequired
    );
  }

  /** Feature A: block until every required prior module with a gating test has been passed. */
  private assertModuleSequenceGate(tenantId: string, enrollmentId: string, test: TestEntity): void {
    for (const prior of this.requiredPriorModules(tenantId, test)) {
      const gating = this.getModuleGatingTest(tenantId, prior.id);
      if (gating && !this.isExamPassed(tenantId, enrollmentId, gating.id)) {
        throw new PreconditionFailedException({
          code: 'module_gate_locked',
          message: `Module "${prior.title}" intermediate test must be passed first`
        });
      }
    }
  }

  /** Feature B: block a module test until the module's minimum study time is met. */
  private assertMinViewGate(tenantId: string, enrollmentId: string, test: TestEntity): void {
    if (!test.moduleId) return;
    const moduleEntity = this.getById(this.state.modules, tenantId, test.moduleId);
    if (moduleEntity.minViewSeconds <= 0) return;
    const progress = this.state.moduleProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleEntity.id
    );
    const studied = progress?.studiedSeconds ?? 0;
    if (studied < moduleEntity.minViewSeconds) {
      throw new PreconditionFailedException({
        code: 'min_view_not_met',
        message: `Minimum study time not met (${moduleEntity.minViewSeconds - studied}s remaining)`
      });
    }
  }

  // ─── Feature C: Pre-exam identity authentication (Wave 1 Plan 2 / Приказ №816) ───

  /** Feature C: the group-course toggle that turns on pre-exam identity auth. */
  private groupCourseRequiresPreExamAuth(
    tenantId: string,
    groupId: string,
    courseId: string
  ): boolean {
    const gc = this.state.groupCourses.find(
      (item) => item.tenantId === tenantId && item.groupId === groupId && item.courseId === courseId
    );
    return gc?.requiresPreExamAuth === true;
  }

  /** A consumed (and thus verifying) token for this learner's enrollment + test, if any. */
  private findPreExamVerification(
    tenantId: string,
    enrollmentId: string,
    testId: string
  ): PreExamToken | undefined {
    return this.state.preExamTokens.find(
      (t) =>
        t.tenantId === tenantId &&
        t.enrollmentId === enrollmentId &&
        t.testId === testId &&
        Boolean(t.consumedAt)
    );
  }

  /**
   * Feature C gate. Only final/course-level exams (no moduleId) are identity-gated,
   * and only when the group-course requires it. After verification the consumed
   * token persists, so repeat attempts of the same exam are not re-prompted.
   */
  private assertPreExamAuthGate(tenantId: string, enrollment: Enrollment, test: TestEntity): void {
    if (test.moduleId) return; // intermediate module tests are never identity-gated
    if (!this.groupCourseRequiresPreExamAuth(tenantId, enrollment.groupId, test.courseId)) return;
    if (this.findPreExamVerification(tenantId, enrollment.id, test.id)) return;
    throw new PreconditionFailedException({
      code: 'pre_exam_auth_required',
      message: 'Identity verification is required before starting this exam'
    });
  }

  /** Shared resolution + course-link guard used by startAttempt and pre-exam endpoints. */
  private resolveAttemptContext(
    tenantId: string,
    request: StartAttemptRequest
  ): { test: TestEntity; enrollment: Enrollment } {
    const test = this.getById(this.state.tests, tenantId, request.testId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === test.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the test course'
      });
    }
    return { test, enrollment };
  }

  /**
   * Issue a single-use identity token and "send" the verify link (logged in dev/pilot;
   * a real e-mail adapter is a follow-up). Never returns the raw token.
   */
  requestPreExamToken(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): { delivered: true; alreadyVerified: boolean } {
    const { test, enrollment } = this.resolveAttemptContext(tenantId, request);
    if (this.findPreExamVerification(tenantId, enrollment.id, test.id)) {
      return { delivered: true, alreadyVerified: true };
    }
    const rawToken = generatePreExamToken();
    const now = this.now();
    const entity: PreExamToken = {
      id: this.id('preexam'),
      tenantId,
      enrollmentId: enrollment.id,
      testId: test.id,
      learnerId: enrollment.learnerId,
      tokenHash: hashPreExamToken(rawToken),
      expiresAt: new Date(new Date(now).getTime() + PRE_EXAM_TOKEN_TTL_MS).toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.preExamTokens.push(entity);
    this.preExamLogger.log(
      `pre_exam_auth.delivery enrollment=${enrollment.id} test=${test.id} url=${buildPreExamAuthUrl(rawToken)} (log-only)`
    );
    this.audit(
      tenantId,
      actorId,
      'assessment.pre_exam_token_requested',
      'assessment.pre_exam_token',
      entity.id,
      undefined,
      { id: entity.id, enrollmentId: entity.enrollmentId, testId: entity.testId },
      context
    );
    return { delivered: true, alreadyVerified: false };
  }

  /**
   * @internal Test/dev-only: like {@link requestPreExamToken} but returns the raw token.
   * SECURITY: returning the raw token bypasses the e-mail-delivery identity check, so this
   * MUST NEVER be wired to an HTTP endpoint. Use only from unit tests (direct instantiation).
   */
  requestPreExamTokenRaw(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): string {
    const { test, enrollment } = this.resolveAttemptContext(tenantId, request);
    const rawToken = generatePreExamToken();
    const now = this.now();
    const entity: PreExamToken = {
      id: this.id('preexam'),
      tenantId,
      enrollmentId: enrollment.id,
      testId: test.id,
      learnerId: enrollment.learnerId,
      tokenHash: hashPreExamToken(rawToken),
      expiresAt: new Date(new Date(now).getTime() + PRE_EXAM_TOKEN_TTL_MS).toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.preExamTokens.push(entity);
    // actorId and context are used consistently with the public method but audit is omitted
    // (this is test/dev only — the raw token exists only in test code, never in production flow).
    void actorId;
    void context;
    return rawToken;
  }

  /** Redeem the link: mark the matching token consumed (= verification record). */
  verifyPreExamToken(
    tenantId: string,
    actorId: string | undefined,
    request: { token: string },
    context: RequestContext
  ): { verified: true; enrollmentId: string; testId: string } {
    const tokenHash = hashPreExamToken(request.token ?? '');
    const record = this.state.preExamTokens.find(
      (t) => t.tenantId === tenantId && t.tokenHash === tokenHash
    );
    if (!record) {
      throw new BadRequestException({
        code: 'pre_exam_token_invalid',
        message: 'Verification link is invalid'
      });
    }
    if (!record.consumedAt) {
      if (new Date(record.expiresAt).getTime() < new Date(this.now()).getTime()) {
        throw new PreconditionFailedException({
          code: 'pre_exam_token_expired',
          message: 'Verification link has expired'
        });
      }
      record.consumedAt = this.now();
      record.verifiedByActorId = actorId;
      record.updatedAt = this.now();
      this.audit(
        tenantId,
        actorId,
        'assessment.pre_exam_token_verified',
        'assessment.pre_exam_token',
        record.id,
        undefined,
        { id: record.id, enrollmentId: record.enrollmentId, testId: record.testId },
        context
      );
    }
    return { verified: true, enrollmentId: record.enrollmentId, testId: record.testId };
  }

  // ─── Phase 4 Plan A: documentary identity verification (selfie + passport) ───

  /** Resolve the learner this identity action targets: explicit id (with anti-IDOR check) or the actor's linked learner. */
  private resolveIdentityLearner(
    tenantId: string,
    actorId: string | undefined,
    explicitLearnerId: string | undefined,
    permissions?: string[]
  ): Learner {
    if (explicitLearnerId) {
      const learner = this.getById(this.state.learners, tenantId, explicitLearnerId);
      this.assertActorMatchesLearnerIamLink(tenantId, actorId, learner.id, permissions);
      return learner;
    }
    const linked = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.linkedIamUserId === actorId
    );
    if (!linked) {
      throw new BadRequestException({
        code: 'learner_not_linked',
        message: 'No learner profile is linked to the current user'
      });
    }
    return linked;
  }

  /** Latest approved verification for the learner (indefinite validity in pilot — validUntil ignored). */
  private findApprovedIdentityVerification(
    tenantId: string,
    learnerId: string
  ): IdentityVerification | undefined {
    return this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId && v.learnerId === learnerId && v.verificationStatus === 'approved'
    );
  }

  // ─── ЕСИА (Госуслуги) OAuth seam helpers ──────────────────────────────────

  /** Digits-only normalisation so '112-233-445 95' and '11223344595' compare equal. */
  private normalizeSnils(snils: string | undefined): string {
    return (snils ?? '').replace(/\D/g, '');
  }

  /** Learners in this tenant whose СНИЛС matches (normalised). Empty when none — caller denies. */
  findLearnersBySnils(tenantId: string, snils: string): Learner[] {
    const target = this.normalizeSnils(snils);
    if (target.length === 0) return [];
    return this.state.learners.filter(
      (l) => l.tenantId === tenantId && this.normalizeSnils(l.snils) === target
    );
  }

  /**
   * ЕСИА success → an `approved` IdentityVerification for the learner (method 'esia'),
   * unlocking assertIdentityVerificationGate. Idempotent: returns the existing approved record.
   */
  approveIdentityViaEsia(
    tenantId: string,
    learnerId: string,
    context: RequestContext
  ): IdentityVerification {
    const existing = this.findApprovedIdentityVerification(tenantId, learnerId);
    if (existing) return existing;
    const now = this.now();
    const entity: IdentityVerification = {
      id: this.id('idv'),
      tenantId,
      learnerId,
      method: 'esia',
      verificationStatus: 'approved',
      status: 'active',
      reviewedByActorId: 'system_esia',
      reviewedAt: now,
      consentAt: now,
      createdAt: now,
      updatedAt: now
    };
    this.state.identityVerifications.push(entity);
    this.audit(
      tenantId,
      'system_esia',
      'learning.identity_verification_approved_by_esia',
      'learning.identity_verification',
      entity.id,
      undefined,
      { id: entity.id, learnerId, method: 'esia' },
      context
    );
    return entity;
  }

  /**
   * Links a learner profile to an IAM user (idempotent).
   * Sets `linkedIamUserId` only when currently empty — if already set to ANY value,
   * it is a no-op (never overwrites an existing link). Audit fires only on actual link.
   */
  linkLearnerToIamUser(tenantId: string, learnerId: string, iamUserId: string): void {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) return; // nothing to link — caller responsible for prior validation
    if (learner.linkedIamUserId) return; // already linked — no-op regardless of the new value
    learner.linkedIamUserId = iamUserId;
    learner.updatedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId: 'system_esia',
      action: 'learning.learner_linked_to_user',
      entityType: 'learning.learner',
      entityId: learnerId,
      oldValues: undefined,
      newValues: { learnerId, iamUserId }
    });
  }

  /**
   * Returns the learner whose `linkedIamUserId === iamUserId` in this tenant.
   * Throws `learner_not_linked` (BadRequestException) when none found — mirrors
   * the private `resolveIdentityLearner` pattern.
   */
  getLinkedLearnerForUser(tenantId: string, iamUserId: string): Learner {
    const linked = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.linkedIamUserId === iamUserId
    );
    if (!linked) {
      throw new BadRequestException({
        code: 'learner_not_linked',
        message: 'No learner profile is linked to the current user'
      });
    }
    return linked;
  }

  /** Phase 4 Plan A: the group-course toggle for documentary identity verification. */
  private groupCourseRequiresIdentityVerification(
    tenantId: string,
    groupId: string,
    courseId: string
  ): boolean {
    const gc = this.state.groupCourses.find(
      (item) => item.tenantId === tenantId && item.groupId === groupId && item.courseId === courseId
    );
    return gc?.requiresIdentityVerification === true;
  }

  /**
   * Phase 4 Plan A gate. Final/course-level exams only (no moduleId), only when the
   * group-course requires it. Orthogonal to assertPreExamAuthGate (№816 e-mail link):
   * this gate proves identity by document, per-LEARNER, valid indefinitely in pilot.
   * NB: the message deliberately avoids the substring "identity verification is required"
   * (the Wave 1 frontend regex matches it for its own interstitial).
   */
  private assertIdentityVerificationGate(
    tenantId: string,
    enrollment: Enrollment,
    test: TestEntity
  ): void {
    if (test.moduleId) return;
    if (!this.groupCourseRequiresIdentityVerification(tenantId, enrollment.groupId, test.courseId))
      return;
    if (this.findApprovedIdentityVerification(tenantId, enrollment.learnerId)) return;
    throw new PreconditionFailedException({
      code: 'identity_verification_required',
      message: 'Identity confirmation by document is required before starting this exam'
    });
  }

  startIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    request: { learnerId?: string },
    context: RequestContext
  ): IdentityVerification {
    const learner = this.resolveIdentityLearner(
      tenantId,
      actorId,
      request.learnerId,
      context.permissions
    );
    if (this.findApprovedIdentityVerification(tenantId, learner.id)) {
      throw new ConflictException({
        code: 'identity_already_verified',
        message: 'Identity is already verified for this learner'
      });
    }
    const pending = this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId && v.learnerId === learner.id && v.verificationStatus === 'pending'
    );
    if (pending) {
      throw new ConflictException({
        code: 'identity_verification_pending',
        message: 'A submitted verification is already awaiting review'
      });
    }
    const draft = this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId && v.learnerId === learner.id && v.verificationStatus === 'draft'
    );
    if (draft) return draft; // idempotent: return the existing draft silently (no duplicate audit event)
    const now = this.now();
    const entity: IdentityVerification = {
      id: this.id('idv'),
      tenantId,
      learnerId: learner.id,
      method: 'selfie_passport',
      verificationStatus: 'draft',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.identityVerifications.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.identity_verification_started',
      'learning.identity_verification',
      entity.id,
      undefined,
      { id: entity.id, learnerId: entity.learnerId },
      context
    );
    return entity;
  }

  async createIdentityVerificationUploadIntent(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { originalName: string; contentType: string; sizeBytes: number },
    context: RequestContext
  ): Promise<UploadIntent> {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.verificationStatus !== 'draft') {
      throw new PreconditionFailedException({
        code: 'identity_verification_not_editable',
        message: 'Files can only be attached to a draft verification'
      });
    }
    return this.filesService.createUploadIntent(tenantId, request, {
      keyPrefix: 'identity',
      mimeAllowlist: IDENTITY_MIME_ALLOWLIST
    });
  }

  async submitIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { selfieFileId: string; passportFileId: string; consent: boolean },
    context: RequestContext
  ): Promise<IdentityVerification> {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.verificationStatus !== 'draft') {
      throw new PreconditionFailedException({
        code: 'identity_verification_not_editable',
        message: 'Only a draft verification can be submitted'
      });
    }
    if (request.consent !== true) {
      throw new BadRequestException({
        code: 'consent_required',
        message: 'Consent to personal data processing is required (152-ФЗ)'
      });
    }
    if (request.selfieFileId === request.passportFileId) {
      throw new BadRequestException({
        code: 'identity_files_must_differ',
        message: 'Selfie and passport must be different files'
      });
    }
    const known = await this.filesService.getAntivirusStatuses(tenantId, [
      request.selfieFileId,
      request.passportFileId
    ]);
    if (!known.has(request.selfieFileId) || !known.has(request.passportFileId)) {
      throw new BadRequestException({
        code: 'file_not_found',
        message: 'Uploaded file not found for tenant'
      });
    }
    const now = this.now();
    record.selfieFileId = request.selfieFileId;
    record.passportFileId = request.passportFileId;
    record.consentAt = now;
    record.submittedAt = now;
    record.verificationStatus = 'pending';
    record.updatedAt = now;
    this.audit(
      tenantId,
      actorId,
      'learning.identity_verification_submitted',
      'learning.identity_verification',
      record.id,
      undefined,
      { id: record.id, learnerId: record.learnerId },
      context
    );
    return record;
  }

  reviewIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { decision: 'approve' | 'reject'; rejectionReason?: string },
    context: RequestContext
  ): IdentityVerification {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    if (record.verificationStatus !== 'pending') {
      throw new PreconditionFailedException({
        code: 'identity_verification_not_pending',
        message: 'Only a submitted verification can be reviewed'
      });
    }
    const now = this.now();
    const old = { verificationStatus: record.verificationStatus };
    record.verificationStatus = request.decision === 'approve' ? 'approved' : 'rejected';
    record.reviewedByActorId = actorId;
    record.reviewedAt = now;
    record.updatedAt = now;
    if (request.decision === 'reject' && request.rejectionReason) {
      record.rejectionReason = request.rejectionReason;
    }
    if (request.decision === 'reject') {
      // Logged stub — a real e-mail rides Phase 5 MailerService as a follow-up.
      this.identityVerificationLogger.log(
        `identity_verification.rejected learner=${record.learnerId} verification=${record.id} reason=${request.rejectionReason ?? '-'} (log-only notice)`
      );
    }
    this.audit(
      tenantId,
      actorId,
      request.decision === 'approve'
        ? 'learning.identity_verification_approved'
        : 'learning.identity_verification_rejected',
      'learning.identity_verification',
      record.id,
      old,
      { verificationStatus: record.verificationStatus, rejectionReason: record.rejectionReason },
      context
    );
    return record;
  }

  /** Admin queue: records (optionally by status) enriched with learner display data, newest first. */
  listIdentityVerifications(
    tenantId: string,
    query: { status?: string }
  ): IdentityVerificationView[] {
    const items = this.state.identityVerifications
      .filter(
        (v) => v.tenantId === tenantId && (!query.status || v.verificationStatus === query.status)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.map((v) => this.toIdentityVerificationView(tenantId, v));
  }

  private toIdentityVerificationView(
    tenantId: string,
    record: IdentityVerification
  ): IdentityVerificationView {
    const learner = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.id === record.learnerId
    );
    const learnerName = [learner?.lastName, learner?.firstName, learner?.middleName]
      .filter(Boolean)
      .join(' ');
    return {
      ...record,
      learnerName,
      ...(learner?.snils ? { learnerSnils: learner.snils } : {}),
      ...(learner?.dateOfBirth ? { learnerDateOfBirth: learner.dateOfBirth } : {})
    };
  }

  /** Admin detail: view + presigned image URLs (antivirus-gated by FilesService; absent after purge). */
  async getIdentityVerificationView(
    tenantId: string,
    verificationId: string
  ): Promise<
    IdentityVerificationView & {
      selfieUrl?: string;
      passportUrl?: string;
      selfieFileError?: string;
      passportFileError?: string;
    }
  > {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    const view = this.toIdentityVerificationView(tenantId, record);
    const purged = Boolean(record.imagesPurgedAt);

    const resolveUrl = async (fileId: string | undefined): Promise<string | undefined> => {
      if (!fileId) return undefined;
      return this.filesService.createDownloadUrl(tenantId, fileId);
    };

    const tryResolveUrl = async (
      fileId: string | undefined
    ): Promise<{ url?: string; error?: string }> => {
      if (!fileId) return {};
      try {
        const url = await resolveUrl(fileId);
        return { url };
      } catch (err) {
        const code =
          err instanceof HttpException
            ? ((err.getResponse() as { code?: string }).code ?? 'file_error')
            : 'file_error';
        this.identityVerificationLogger.warn(
          `createDownloadUrl failed tenant=${tenantId} file=${fileId} code=${code}`
        );
        return { error: code };
      }
    };

    const [selfieResult, passportResult] = purged
      ? [{}, {}]
      : await Promise.all([
          tryResolveUrl(record.selfieFileId),
          tryResolveUrl(record.passportFileId)
        ]);

    return {
      ...view,
      ...(selfieResult.url ? { selfieUrl: selfieResult.url } : {}),
      ...(selfieResult.error ? { selfieFileError: selfieResult.error } : {}),
      ...(passportResult.url ? { passportUrl: passportResult.url } : {}),
      ...(passportResult.error ? { passportFileError: passportResult.error } : {})
    };
  }

  /** Learner self-service: own latest record or null (no link → null, not 403 — mirrors listMyAssignments). */
  getMyIdentityVerification(
    tenantId: string,
    actorId: string | undefined
  ): IdentityVerification | null {
    if (!actorId) return null;
    const learnerIds = this.resolveActorLearnerIds(tenantId, actorId);
    if (learnerIds.size === 0) return null;
    const mine = this.state.identityVerifications
      .filter((v) => v.tenantId === tenantId && learnerIds.has(v.learnerId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mine[0] ?? null;
  }

  // ─── Phase 4 Plan B: proctoring (webcam video recording of final exams) ───

  /** Per-student proctoring switch (learners.write): 'require' | 'exempt' | null = inherit group-course. */
  setProctoringOverride(
    tenantId: string,
    actorId: string | undefined,
    enrollmentId: string,
    request: { override: ProctoringOverride | null },
    context: RequestContext
  ): Enrollment {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    const old = { proctoringOverride: enrollment.proctoringOverride ?? null };
    if (request.override === null) {
      delete enrollment.proctoringOverride;
    } else {
      enrollment.proctoringOverride = request.override;
    }
    enrollment.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_override_set',
      'learning.enrollment',
      enrollment.id,
      old,
      { proctoringOverride: enrollment.proctoringOverride ?? null },
      context
    );
    return enrollment;
  }

  /** Effective requirement: enrollment override ?? group-course flag (final exams of this course). */
  private isProctoringRequired(
    tenantId: string,
    enrollment: Enrollment,
    courseId: string
  ): boolean {
    const gc = this.state.groupCourses.find(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === courseId
    );
    return resolveProctoringRequirement(
      enrollment.proctoringOverride,
      gc?.requiresProctoring === true
    );
  }

  /** The learner's open session for this group+course (purged sessions never count). */
  private findActiveProctoringRecording(
    tenantId: string,
    learnerId: string,
    groupId: string,
    courseId: string
  ): ProctoringRecording | undefined {
    return this.state.proctoringRecordings.find(
      (r) =>
        r.tenantId === tenantId &&
        r.learnerId === learnerId &&
        r.groupId === groupId &&
        r.courseId === courseId &&
        r.recordingStatus === 'recording' &&
        !r.purgedAt
    );
  }

  /**
   * Phase 4 Plan B gate (5th assert). Final/course-level exams only (no moduleId), only when
   * the effective requirement (override ?? group-course flag) is on. Passes when an active
   * recording session exists for (learner, group, course).
   * NB: the message deliberately avoids "identity verification is required" (Wave 1 regex)
   * and "identity confirmation by document" (Plan A regex) — the frontend matches err.message.
   */
  private assertProctoringGate(tenantId: string, enrollment: Enrollment, test: TestEntity): void {
    if (test.moduleId) return;
    if (!this.isProctoringRequired(tenantId, enrollment, test.courseId)) return;
    if (
      this.findActiveProctoringRecording(
        tenantId,
        enrollment.learnerId,
        enrollment.groupId,
        test.courseId
      )
    )
      return;
    throw new PreconditionFailedException({
      code: 'proctoring_required',
      message: 'Video recording must be active before starting this exam'
    });
  }

  /**
   * Start (or idempotently resume) a recording session BEFORE the exam attempt (spec §2.5).
   * Takes enrollmentId (not groupId) — the only id the test-player has; group derives from it.
   */
  startProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    request: { enrollmentId: string; courseId: string; consent: boolean },
    context: RequestContext
  ): ProctoringRecording {
    if (request.consent !== true) {
      throw new BadRequestException({
        code: 'consent_required',
        message: 'Consent to video recording is required (152-ФЗ)'
      });
    }
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const linked = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === request.courseId
    );
    if (!linked) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment group is not linked to the course'
      });
    }
    if (!this.isProctoringRequired(tenantId, enrollment, request.courseId)) {
      throw new BadRequestException({
        code: 'proctoring_not_required',
        message: 'Proctoring is not required for this learner and course'
      });
    }
    const active = this.findActiveProctoringRecording(
      tenantId,
      enrollment.learnerId,
      enrollment.groupId,
      request.courseId
    );
    if (active) return active; // idempotent resume — chunks carry nextSequence for the client
    const now = this.now();
    const entity: ProctoringRecording = {
      id: this.id('prec'),
      tenantId,
      learnerId: enrollment.learnerId,
      groupId: enrollment.groupId,
      courseId: request.courseId,
      recordingStatus: 'recording',
      consentAt: now,
      startedAt: now,
      chunks: [],
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.proctoringRecordings.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_started',
      'learning.proctoring_recording',
      entity.id,
      undefined,
      { id: entity.id, learnerId: entity.learnerId, courseId: entity.courseId, consentAt: now },
      context
    );
    return entity;
  }

  /**
   * Presigned PUT for one MediaRecorder chunk + registration (own active session only).
   * No per-chunk audit (spec §8 — a 30-second timeslice would flood the log).
   */
  async createProctoringChunkUploadIntent(
    tenantId: string,
    actorId: string | undefined,
    recordingId: string,
    request: { sequence: number; originalName: string; contentType: string; sizeBytes: number },
    context: RequestContext
  ): Promise<UploadIntent> {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.recordingStatus !== 'recording') {
      throw new PreconditionFailedException({
        code: 'proctoring_recording_not_active',
        message: 'Chunks can only be uploaded to an active recording session'
      });
    }
    if (record.chunks.some((c) => c.sequence === request.sequence)) {
      throw new ConflictException({
        code: 'proctoring_chunk_duplicate',
        message: 'A chunk with this sequence is already registered'
      });
    }
    // NOTE: reuses the files-layer 10 MB ceiling (SUBMISSION_MAX_BYTES) — enough for a 30-second
    // webm chunk at default MediaRecorder bitrates; higher-bitrate needs would require a per-intent
    // maxBytes option in FilesService, not a change here.
    const intent = await this.filesService.createUploadIntent(
      tenantId,
      {
        originalName: request.originalName,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes
      },
      { keyPrefix: 'proctoring', mimeAllowlist: PROCTORING_MIME_ALLOWLIST }
    );
    const now = this.now();
    record.chunks.push({
      sequence: request.sequence,
      fileId: intent.fileId,
      uploadedIntentAt: now
    });
    record.updatedAt = now;
    return intent;
  }

  /** Stop the session (idempotent): recording → completed, completedAt stamped once. */
  completeProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    recordingId: string,
    context: RequestContext
  ): ProctoringRecording {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.recordingStatus === 'completed') return record;
    const oldValues = { recordingStatus: record.recordingStatus };
    const now = this.now();
    record.recordingStatus = 'completed';
    record.completedAt = now;
    record.updatedAt = now;
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_completed',
      'learning.proctoring_recording',
      record.id,
      oldValues,
      { recordingStatus: 'completed', completedAt: now, chunkCount: record.chunks.length },
      context
    );
    return record;
  }

  /** Resume support: the actor's active session for the enrollment+course + next chunk sequence. */
  getMyActiveProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    query: { enrollmentId: string; courseId: string },
    context: RequestContext
  ): { recording: ProctoringRecording; nextSequence: number } | null {
    const enrollment = this.getById(this.state.enrollments, tenantId, query.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const active = this.findActiveProctoringRecording(
      tenantId,
      enrollment.learnerId,
      enrollment.groupId,
      query.courseId
    );
    if (!active) return null;
    const maxSequence = active.chunks.reduce((max, c) => Math.max(max, c.sequence), -1);
    return { recording: active, nextSequence: maxSequence + 1 };
  }

  /** Admin queue (proctoring.read): sessions (optionally by recordingStatus), newest first, enriched. */
  listProctoringRecordings(
    tenantId: string,
    query: { status?: string }
  ): ProctoringRecordingView[] {
    return this.state.proctoringRecordings
      .filter(
        (r) => r.tenantId === tenantId && (!query.status || r.recordingStatus === query.status)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => this.toProctoringRecordingView(tenantId, r));
  }

  private toProctoringRecordingView(
    tenantId: string,
    record: ProctoringRecording
  ): ProctoringRecordingView {
    const learner = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.id === record.learnerId
    );
    const learnerName = [learner?.lastName, learner?.firstName, learner?.middleName]
      .filter(Boolean)
      .join(' ');
    const course = this.state.courses.find(
      (c) => c.tenantId === tenantId && c.id === record.courseId
    );
    const attempt = record.attemptId
      ? this.state.attempts.find((a) => a.tenantId === tenantId && a.id === record.attemptId)
      : undefined;
    return {
      ...record,
      learnerName,
      courseTitle: course?.title ?? '',
      ...(attempt ? { attemptStatus: attempt.status } : {})
    };
  }

  /**
   * Admin detail + playback (proctoring.read): ordered presigned GET urls of CLEAN chunks.
   * Infected chunks → excluded with a file_infected issue (no URL request — batch AV check first);
   * URL-signing failures degrade per-chunk (mirror of Plan A selfieFileError); sequence gaps
   * 0..max are reported as missing_chunk. A purged recording returns metadata only.
   */
  async getProctoringRecordingView(
    tenantId: string,
    recordingId: string
  ): Promise<ProctoringRecordingDetail> {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    const view = this.toProctoringRecordingView(tenantId, record);
    const playbackChunks: ProctoringPlaybackChunk[] = [];
    const chunkIssues: ProctoringChunkIssue[] = [];
    const chunks = [...record.chunks].sort((a, b) => a.sequence - b.sequence);
    if (!record.purgedAt && chunks.length > 0) {
      const statuses = await this.filesService.getAntivirusStatuses(
        tenantId,
        chunks.map((c) => c.fileId)
      );
      for (const chunk of chunks) {
        if (statuses.get(chunk.fileId) === 'infected') {
          chunkIssues.push({ sequence: chunk.sequence, code: 'file_infected' });
          continue;
        }
        // 'pending'/'error' statuses fall through on purpose: createDownloadUrl lazily re-scans
        // and its throw degrades to a per-chunk issue below (files-layer semantics, spec §2.10).
        try {
          const url = await this.filesService.createDownloadUrl(tenantId, chunk.fileId);
          playbackChunks.push({ sequence: chunk.sequence, fileId: chunk.fileId, url });
        } catch (err) {
          const rawCode =
            err instanceof HttpException
              ? ((err.getResponse() as { code?: string }).code ?? 'file_error')
              : 'file_error';
          // Any unrecognized files-layer code collapses to 'file_error' to keep the issue union closed.
          const code: ProctoringChunkIssue['code'] =
            rawCode === 'file_infected' || rawCode === 'file_scan_failed' ? rawCode : 'file_error';
          chunkIssues.push({ sequence: chunk.sequence, code });
        }
      }
      const present = new Set(chunks.map((c) => c.sequence));
      const maxSequence = chunks[chunks.length - 1]!.sequence;
      for (let sequence = 0; sequence <= maxSequence; sequence += 1) {
        if (!present.has(sequence)) chunkIssues.push({ sequence, code: 'missing_chunk' });
      }
    }
    return { ...view, playbackChunks, chunkIssues };
  }

  saveAnswer(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    request: SaveAttemptAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      attempt.learnerId,
      context.permissions
    );
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      attempt.learnerId,
      context.permissions
    );

    if (!['draft', 'in_progress'].includes(attempt.status))
      throw new PreconditionFailedException({
        code: 'attempt_terminal',
        message: 'Cannot update answers in terminal state'
      });
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) {
      attempt.status = 'expired';
      throw new PreconditionFailedException({
        code: 'attempt_expired',
        message: 'Attempt expired'
      });
    }
    if (!attempt.questionOrder.includes(request.questionId))
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Question is not part of attempt snapshot'
      });
    const existing = this.state.attemptAnswers.find(
      (item) =>
        item.tenantId === tenantId &&
        item.attemptId === attemptId &&
        item.questionId === request.questionId
    );
    const answer = existing ?? {
      id: this.id('ans'),
      tenantId,
      attemptId,
      questionId: request.questionId,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    answer.selectedOptionIds = request.selectedOptionIds;
    answer.textAnswer = request.textAnswer;
    answer.updatedAt = this.now();
    if (!existing) this.state.attemptAnswers.push(answer);
    this.audit(
      tenantId,
      actorId,
      'assessment.answer_saved',
      'assessment.attempt_answer',
      answer.id,
      undefined,
      answer,
      context,
      delegationAuditMetadata
    );
    return answer;
  }
  saveAttemptAnswer(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    request: SaveAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    return this.saveAnswer(
      tenantId,
      actorId,
      attemptId,
      {
        questionId: request.questionId,
        selectedOptionIds: request.selectedOptionIds ?? request.answerOptionIds,
        textAnswer: request.textAnswer
      },
      context
    );
  }
  createAnswer(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAnswerHttpRequest,
    context: RequestContext
  ): AttemptAnswer {
    return this.saveAttemptAnswer(tenantId, actorId, request.attemptId, request, context);
  }
  patchAnswer(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: SaveAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    const answer = this.getById(this.state.attemptAnswers, tenantId, id);
    return this.saveAttemptAnswer(tenantId, actorId, answer.attemptId, request, context);
  }
  submitAttempt(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    context: RequestContext
  ): TestAttempt {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      attempt.learnerId,
      context.permissions
    );
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      attempt.learnerId,
      context.permissions
    );

    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status))
      return attempt;
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) attempt.status = 'expired';
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    const answers = this.state.attemptAnswers.filter(
      (item) => item.tenantId === tenantId && item.attemptId === attempt.id
    );
    let score = 0;
    for (const qid of attempt.questionOrder) {
      const question = this.getById(this.state.questions, tenantId, qid);
      const options = this.state.answerOptions.filter(
        (item) => item.tenantId === tenantId && item.questionId === qid
      );
      const answer = answers.find((item) => item.questionId === qid);
      const graded = gradeAnswer({ question, options, answer });
      if (answer) {
        answer.score = graded.score;
        answer.autoGraded = graded.autoGraded;
        answer.updatedAt = this.now();
      }
      score += graded.score;
    }
    attempt.score = score;
    attempt.passed = score >= test.rules.passingScore;
    attempt.status = 'submitted';
    attempt.submittedAt = this.now();
    attempt.updatedAt = this.now();
    this.finalizeExamResult(tenantId, actorId, attempt, context, delegationAuditMetadata);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_submitted',
      'assessment.test_attempt',
      attempt.id,
      undefined,
      attempt,
      context,
      delegationAuditMetadata
    );
    return attempt;
  }
  finishAttempt(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    context: RequestContext
  ): TestAttempt {
    const submitted = this.submitAttempt(tenantId, actorId, attemptId, context);
    submitted.status = 'finished';
    submitted.finishedAt = this.now();
    submitted.updatedAt = this.now();
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      submitted.learnerId,
      context.permissions
    );
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_finished',
      'assessment.test_attempt',
      submitted.id,
      undefined,
      submitted,
      context,
      delegationAuditMetadata
    );
    return submitted;
  }

  completeAttemptReview(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    input: CompleteAttemptReviewInput,
    context: RequestContext
  ): TestAttempt {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    if (attempt.status !== 'submitted') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Only submitted attempts can be reviewed'
      });
    }
    const answers = this.state.attemptAnswers.filter(
      (a) => a.tenantId === tenantId && a.attemptId === attempt.id
    );
    for (const item of input.answerScores) {
      const answer = answers.find((a) => a.questionId === item.questionId);
      if (!answer) {
        throw new BadRequestException({
          code: 'validation_error',
          message: `No answer recorded for question ${item.questionId}`
        });
      }
      if (answer.autoGraded !== false) {
        throw new PreconditionFailedException({
          code: 'domain_rule_violation',
          message: 'Only manually-gradable (non-auto-graded) answers can be scored'
        });
      }
      const question = this.getById(this.state.questions, tenantId, item.questionId);
      if (item.score < 0 || item.score > question.score) {
        throw new BadRequestException({
          code: 'validation_error',
          message: 'Score must be within [0, question.score]'
        });
      }
      answer.score = item.score;
      answer.updatedAt = this.now();
    }
    const total = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    attempt.score = total;
    attempt.passed = total >= test.rules.passingScore;
    attempt.status = 'finished';
    attempt.finishedAt = this.now();
    attempt.reviewedBy = actorId;
    if (input.reviewComment !== undefined) attempt.reviewComment = input.reviewComment;
    attempt.updatedAt = this.now();
    this.finalizeExamResult(tenantId, actorId, attempt, context);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_review_completed',
      'assessment.test_attempt',
      attempt.id,
      undefined,
      attempt,
      context
    );
    return attempt;
  }

  listExamResults(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<ExamResult> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.examResults
        : this.state.examResults.filter(
            (r) => r.tenantId === tenantId && scope.includes(r.learnerId)
          );
    return this.list(source, tenantId, query);
  }
  getExamResult(tenantId: string, id: string, access?: MvpAssessmentReadAccess): ExamResult {
    const result = this.getById(this.state.examResults, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, result.learnerId, access);
    return result;
  }
  getExamResultByEnrollment(
    tenantId: string,
    enrollmentId: string,
    access?: MvpAssessmentReadAccess
  ): ExamResult[] {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    this.assertAssessmentReadAllowedForLearner(tenantId, enrollment.learnerId, access);
    return this.state.examResults.filter(
      (item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId
    );
  }
  getAttemptResult(tenantId: string, id: string, access?: MvpAssessmentReadAccess): ExamResult {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, attempt.learnerId, access);
    return this.recalculateExamResult(
      tenantId,
      attempt.testId,
      attempt.enrollmentId,
      attempt.learnerId
    );
  }
  recalculateExamResults(tenantId: string): { count: number } {
    const grouped = new Set<string>();
    this.state.attempts
      .filter((item) => item.tenantId === tenantId)
      .forEach((item) => grouped.add(`${item.testId}:${item.enrollmentId}:${item.learnerId}`));

    for (const key of grouped) {
      const [testId, enrollmentId, learnerId] = key.split(':');
      if (!testId || !enrollmentId || !learnerId) {
        continue;
      }
      this.recalculateExamResult(tenantId, testId, enrollmentId, learnerId);
    }

    return { count: grouped.size };
  }
  private finalizeExamResult(
    tenantId: string,
    actorId: string | undefined,
    attempt: TestAttempt,
    context: RequestContext,
    delegationAuditMetadata?: Record<string, unknown>
  ): void {
    const existing = this.state.examResults.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === attempt.enrollmentId &&
        item.testId === attempt.testId
    );
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === attempt.enrollmentId &&
        item.testId === attempt.testId &&
        ['submitted', 'finished'].includes(item.status)
    );
    const best = attempts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? attempt;
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    if (existing) {
      existing.bestAttemptId = best.id;
      existing.attemptsCount = attempts.length;
      existing.finalScore = best.score ?? 0;
      existing.maxScore = best.maxScore;
      existing.passed = (best.score ?? 0) >= test.rules.passingScore;
      existing.updatedAt = this.now();
      this.audit(
        tenantId,
        actorId,
        'assessment.exam_result_finalized',
        'assessment.exam_result',
        existing.id,
        undefined,
        existing,
        context,
        delegationAuditMetadata
      );
      return;
    }
    const entity: ExamResult = {
      id: this.id('result'),
      tenantId,
      enrollmentId: attempt.enrollmentId,
      learnerId: attempt.learnerId,
      testId: attempt.testId,
      bestAttemptId: best.id,
      attemptsCount: attempts.length,
      finalScore: best.score ?? 0,
      maxScore: best.maxScore,
      passed: (best.score ?? 0) >= test.rules.passingScore,
      status: 'final',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.examResults.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.exam_result_finalized',
      'assessment.exam_result',
      entity.id,
      undefined,
      entity,
      context,
      delegationAuditMetadata
    );
  }

  listAssignments(tenantId: string, query: BaseFilterQuery): ListResponse<Assignment> {
    return this.list(this.state.assignments, tenantId, query);
  }
  getAssignment(tenantId: string, id: string): Assignment {
    return this.getById(this.state.assignments, tenantId, id);
  }
  createAssignment(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentRequest,
    context: RequestContext
  ): Assignment {
    const entity: Assignment = {
      id: this.id('asn'),
      tenantId,
      courseId: request.courseId,
      moduleId: request.moduleId,
      title: request.title,
      description: request.description,
      maxScore: request.maxScore ?? 0,
      isReviewRequired: request.isReviewRequired ?? true,
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignments.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_created',
      'assessment.assignment',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentRequest,
    context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_updated',
      'assessment.assignment',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  publishAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    if (current.status === 'published') return current;
    current.status = 'published';
    current.publishedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_published',
      'assessment.assignment',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  archiveAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    if (current.isArchived) return current;
    current.status = 'archived';
    current.isArchived = true;
    current.archivedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_archived',
      'assessment.assignment',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  listAssignmentSubmissions(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<AssignmentSubmission> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.assignmentSubmissions
        : this.state.assignmentSubmissions.filter(
            (s) => s.tenantId === tenantId && scope.includes(s.learnerId)
          );
    return this.list(source, tenantId, query);
  }
  async getAssignmentSubmission(
    tenantId: string,
    id: string,
    access?: MvpAssessmentReadAccess
  ): Promise<AssignmentSubmission & { antivirusStatus: string | null }> {
    const submission = this.getById(this.state.assignmentSubmissions, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, submission.learnerId, access);
    // V1.1 AV gate: surface the attached file's antivirus status so the learner UI can reflect it.
    const antivirusStatus = submission.fileId
      ? await this.filesService.getAntivirusStatus(tenantId, submission.fileId)
      : null;
    return { ...submission, antivirusStatus };
  }
  createAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentSubmissionRequest,
    context: RequestContext
  ): AssignmentSubmission {
    const claimedLearner = request.learnerId?.trim();
    if (!claimedLearner) {
      throw new BadRequestException({ code: 'validation_error', message: 'learnerId is required' });
    }
    const assignment = this.getById(this.state.assignments, tenantId, request.assignmentId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === assignment.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the assignment course'
      });
    }
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );

    const submission: AssignmentSubmission = {
      id: this.id('subm'),
      tenantId,
      assignmentId: request.assignmentId,
      enrollmentId: request.enrollmentId,
      learnerId: enrollment.learnerId,
      answerText: request.answerText,
      fileId: request.fileId,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignmentSubmissions.push(submission);
    return submission;
  }
  updateAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentSubmissionRequest,
    context: RequestContext
  ): AssignmentSubmission {
    const current = this.getById(this.state.assignmentSubmissions, tenantId, id);
    const enrollment = this.getById(this.state.enrollments, tenantId, current.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );

    if (['submitted', 'under_review', 'reviewed', 'rejected'].includes(current.status))
      throw new PreconditionFailedException({
        code: 'submission_terminal',
        message: 'Submission is not editable'
      });
    Object.assign(current, request, { updatedAt: this.now() });
    return current;
  }
  submitAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): AssignmentSubmission {
    const current = this.getById(this.state.assignmentSubmissions, tenantId, id);
    const enrollment = this.getById(this.state.enrollments, tenantId, current.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const delegationAuditMetadata = this.delegatedLearningAuditMetadata(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );

    if (['submitted', 'under_review', 'reviewed'].includes(current.status)) return current;
    current.status = 'submitted';
    current.submittedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_submission_submitted',
      'assessment.assignment_submission',
      current.id,
      undefined,
      current,
      context,
      delegationAuditMetadata
    );
    if (current.fileId) {
      // Best-effort proactive scan. submitAssignmentSubmission is synchronous → fire-and-forget.
      // Safety is guaranteed by the download gate's lazy fallback (it re-scans `pending`), so a
      // failure here is non-fatal — log and move on.
      void this.filesService
        .scanFile(tenantId, current.fileId, actorId)
        .catch((err) =>
          this.avScanLogger.warn(`proactive scan failed for file ${current.fileId}: ${String(err)}`)
        );
    }
    return current;
  }

  // === Phase 3 Plan C — file upload wrappers ===

  async createSubmissionUploadIntent(
    tenantId: string,
    actorId: string | undefined,
    submissionId: string,
    request: { originalName: string; contentType: string; sizeBytes: number },
    context: RequestContext
  ): Promise<UploadIntent> {
    const submission = this.getById(this.state.assignmentSubmissions, tenantId, submissionId);
    const enrollment = this.getById(this.state.enrollments, tenantId, submission.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    if (!['draft', 'returned'].includes(submission.status)) {
      throw new PreconditionFailedException({
        code: 'submission_not_editable',
        message: 'Files can only be attached to a draft or returned submission'
      });
    }
    return this.filesService.createUploadIntent(tenantId, request);
  }

  async getSubmissionFileUrl(
    tenantId: string,
    submissionId: string,
    access?: MvpAssessmentReadAccess
  ): Promise<{ url: string }> {
    const submission = this.getById(this.state.assignmentSubmissions, tenantId, submissionId);
    this.assertAssessmentReadAllowedForLearner(tenantId, submission.learnerId, access);
    if (!submission.fileId) {
      throw new BadRequestException({
        code: 'no_file',
        message: 'Submission has no attached file'
      });
    }
    const url = await this.filesService.createDownloadUrl(tenantId, submission.fileId);
    return { url };
  }

  listAssignmentReviews(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentReview> {
    return this.list(this.state.assignmentReviews, tenantId, query);
  }
  getAssignmentReview(tenantId: string, id: string): AssignmentReview {
    return this.getById(this.state.assignmentReviews, tenantId, id);
  }
  createAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentReviewRequest,
    _context: RequestContext
  ): AssignmentReview {
    const submission = this.getById(
      this.state.assignmentSubmissions,
      tenantId,
      request.submissionId
    );
    if (!['submitted', 'under_review'].includes(submission.status)) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Submission must be submitted before review'
      });
    }
    const existingReview = this.state.assignmentReviews.find(
      (item) => item.tenantId === tenantId && item.submissionId === submission.id
    );
    if (existingReview) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Assignment review already exists for submission'
      });
    }
    this.validateAssignmentReviewScore(tenantId, submission.assignmentId, request.score);
    submission.status = 'under_review';
    const review: AssignmentReview = {
      id: this.id('rev'),
      tenantId,
      assignmentId: submission.assignmentId,
      submissionId: submission.id,
      enrollmentId: submission.enrollmentId,
      reviewerId: actorId ?? 'unknown',
      score: request.score,
      comment: request.comment,
      status: 'in_review',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignmentReviews.push(review);
    return review;
  }
  updateAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentReviewRequest,
    context: RequestContext
  ): AssignmentReview {
    const review = this.getById(this.state.assignmentReviews, tenantId, id);
    if (review.status === 'completed') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Completed review is read-only'
      });
    }
    this.validateAssignmentReviewScore(tenantId, review.assignmentId, request.score);
    const oldValues = { ...review };
    if (request.score !== undefined) review.score = request.score;
    if (request.comment !== undefined) review.comment = request.comment;
    review.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_review_updated',
      'assessment.assignment_review',
      review.id,
      oldValues,
      review,
      context
    );
    return review;
  }
  completeAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: { score?: number; comment?: string },
    context: RequestContext
  ): AssignmentReview {
    const review = this.getById(this.state.assignmentReviews, tenantId, id);
    if (review.status === 'completed') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Review is already completed'
      });
    }
    if (review.status !== 'in_review') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Only in_review assignment review can be completed'
      });
    }
    this.validateAssignmentReviewScore(tenantId, review.assignmentId, request.score);
    review.score = request.score ?? review.score;
    review.comment = request.comment ?? review.comment;
    review.status = 'completed';
    review.completedAt = this.now();
    review.updatedAt = this.now();
    const submission = this.getById(
      this.state.assignmentSubmissions,
      tenantId,
      review.submissionId
    );
    submission.status = 'reviewed';
    submission.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_review_completed',
      'assessment.assignment_review',
      review.id,
      undefined,
      review,
      context
    );
    return review;
  }
  returnAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: ReturnSubmissionInput,
    context: RequestContext
  ): AssignmentSubmission {
    const submission = this.getById(this.state.assignmentSubmissions, tenantId, id);
    if (submission.status !== 'under_review') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Only submissions under review can be returned for revision'
      });
    }
    const reviewIndex = this.state.assignmentReviews.findIndex(
      (r) => r.tenantId === tenantId && r.submissionId === submission.id && r.status !== 'completed'
    );
    if (reviewIndex >= 0) this.state.assignmentReviews.splice(reviewIndex, 1);
    submission.status = 'returned';
    if (request.comment !== undefined) submission.returnComment = request.comment;
    submission.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_submission_returned',
      'assessment.assignment_submission',
      submission.id,
      undefined,
      submission,
      context
    );
    return submission;
  }
  private pushEnrollmentStatusHistory(
    tenantId: string,
    enrollmentId: string,
    status: EnrollmentStatus,
    reason?: string
  ): void {
    this.state.enrollmentStatusHistory.push({
      id: this.id('esh'),
      tenantId,
      enrollmentId,
      status,
      reason,
      changedAt: this.now()
    });
  }

  private canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
    const transitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
      pending: ['active', 'cancelled'],
      active: ['suspended', 'completed', 'cancelled'],
      suspended: ['active', 'cancelled'],
      completed: [],
      cancelled: []
    };
    return transitions[from].includes(to);
  }

  private normalizeTestRules(rules?: Partial<TestRulesDto>) {
    const attemptLimit = Math.max(1, rules?.attemptLimit ?? 1);
    const passingScore = Math.max(0, rules?.passingScore ?? 1);
    return {
      attemptLimit,
      dailyResetEnabled: rules?.dailyResetEnabled ?? false,
      randomizeQuestions: rules?.randomizeQuestions ?? false,
      questionCount: rules?.questionCount,
      timeLimitMinutes: rules?.timeLimitMinutes,
      passingScore
    };
  }

  private resolveAttemptQuestionIds(tenantId: string, test: TestEntity): string[] {
    const linked = this.state.testQuestions
      .filter((item) => item.tenantId === tenantId && item.testId === test.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.questionId);
    const bankIds = test.questionBankId
      ? this.state.questions
          .filter(
            (item) => item.tenantId === tenantId && item.questionBankId === test.questionBankId
          )
          .map((item) => item.id)
      : [];
    let ids = linked.length ? linked : bankIds;
    if (test.rules.randomizeQuestions) ids = [...ids].sort(() => Math.random() - 0.5);
    if (test.rules.questionCount && test.rules.questionCount > 0)
      ids = ids.slice(0, test.rules.questionCount);
    return ids;
  }

  private assertAttemptWritable(attempt: Attempt): void {
    if (attempt.expiresAt && new Date(attempt.expiresAt).getTime() < Date.now()) {
      attempt.status = 'expired';
      attempt.finishedAt = this.now();
    }
    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status)) {
      throw new PreconditionFailedException({
        code: 'attempt_readonly',
        message: 'Attempt is in terminal state'
      });
    }
  }

  private calculateAttemptScore(
    tenantId: string,
    attemptId: string
  ): { score: number; maxScore: number; passingScore: number } {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    const questions = attempt.questionOrder.map((id) =>
      this.getById(this.state.questions, tenantId, id)
    );
    const answers = this.state.attemptAnswers.filter(
      (item) => item.tenantId === tenantId && item.attemptId === attemptId
    );
    let score = 0;
    questions.forEach((question) => {
      const answer = answers.find((item) => item.questionId === question.id);
      const options = this.state.answerOptions.filter(
        (item) => item.tenantId === tenantId && item.questionId === question.id
      );
      if (!answer) return;
      if (question.type === 'text') {
        if ((answer.textAnswer ?? '').trim().length > 0) score += question.maxScore ?? 0;
        return;
      }
      const correctIds = options
        .filter((item) => item.isCorrect)
        .map((item) => item.id)
        .sort();
      const picked = [...(answer.answerOptionIds ?? [])].sort();
      if (JSON.stringify(correctIds) === JSON.stringify(picked)) score += question.maxScore ?? 0;
    });
    return {
      score,
      maxScore: questions.reduce((acc, item) => acc + (item.maxScore ?? 0), 0),
      passingScore: test.rules.passingScore
    };
  }

  private finalizeAttempt(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Attempt {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    if (attempt.status === 'finished') return attempt;
    if (attempt.status === 'in_progress') this.submitAttempt(tenantId, actorId, id, context);
    attempt.status = attempt.status === 'expired' ? 'expired' : 'finished';
    attempt.finishedAt = this.now();
    attempt.updatedAt = this.now();
    this.recalculateExamResult(tenantId, attempt.testId, attempt.enrollmentId, attempt.learnerId);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_finished',
      'assessment.attempt',
      attempt.id,
      undefined,
      attempt,
      context
    );
    return attempt;
  }

  private recalculateExamResult(
    tenantId: string,
    testId: string,
    enrollmentId: string,
    learnerId: string
  ): ExamResult {
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.testId === testId &&
        item.enrollmentId === enrollmentId &&
        item.learnerId === learnerId &&
        // Must match finalizeExamResult's filter. A 'submitted' attempt is terminal
        // for auto-graded tests (only finishAttempt/review reach 'finished'); counting
        // only 'finished' here made a plain getAttemptResult read flip passed → false.
        ['submitted', 'finished'].includes(item.status)
    );
    const best = [...attempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const test = this.getById(this.state.tests, tenantId, testId);
    const existing = this.state.examResults.find(
      (item) =>
        item.tenantId === tenantId &&
        item.testId === testId &&
        item.enrollmentId === enrollmentId &&
        item.learnerId === learnerId
    );
    const record: ExamResult = existing ?? {
      id: this.id('res'),
      tenantId,
      testId,
      enrollmentId,
      learnerId,
      attemptsCount: 0,
      bestScore: 0,
      maxScore: 0,
      passingScore: test.rules.passingScore,
      passed: false,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    record.attemptsCount = attempts.length;
    record.bestAttemptId = best?.id;
    record.bestScore = best?.score ?? 0;
    record.maxScore = best?.maxScore ?? 0;
    record.passingScore = test.rules.passingScore;
    record.passed = record.bestScore >= record.passingScore;
    record.updatedAt = this.now();
    if (!existing) this.state.examResults.push(record);
    return record;
  }

  private normalizeDurationDays(value: number | undefined): number | undefined {
    if (value === undefined || value === null || Number.isNaN(value)) return undefined;
    const n = Math.floor(Number(value));
    if (n < 1) return undefined;
    return Math.min(n, 3650);
  }

  /** Ids of all learners linked to the acting IAM user (tenant-scoped). */
  private resolveActorLearnerIds(tenantId: string, actorId: string): Set<string> {
    return new Set(
      this.state.learners
        .filter((l) => l.tenantId === tenantId && l.linkedIamUserId === actorId)
        .map((l) => l.id)
    );
  }

  private learnerIdsBoundToIamActor(
    tenantId: string,
    actorId: string | undefined
  ): string[] | null {
    if (!actorId) return null;
    const ids = this.state.learners
      .filter((l) => l.tenantId === tenantId && l.linkedIamUserId === actorId)
      .map((l) => l.id);
    return ids.length > 0 ? ids : null;
  }

  private hasAssessmentReadBypass(access: MvpAssessmentReadAccess | undefined): boolean {
    const p = access?.permissions;
    if (!p?.length) return false;
    return (
      p.includes(ASSESSMENT_READ_CROSS_LEARNER_PERMISSION) || p.includes(LEARNERS_ACT_AS_PERMISSION)
    );
  }

  /** Ограничение list-эндпойнтов строками слушателя, привязанного к JWT (кроме админских ролей). */
  private restrictLearnerIdsForAssessmentList(
    tenantId: string,
    access: MvpAssessmentReadAccess | undefined
  ): string[] | null {
    if (!access?.actorId) return null;
    const bound = this.learnerIdsBoundToIamActor(tenantId, access.actorId);
    if (!bound) return null;
    if (this.hasAssessmentReadBypass(access)) return null;
    return bound;
  }

  /** GET по сущности слушателя с linkedIamUserId: свой JWT или bypass-роль. */
  private assertAssessmentReadAllowedForLearner(
    tenantId: string,
    learnerId: string,
    access: MvpAssessmentReadAccess | undefined
  ): void {
    if (!access?.actorId) return;
    if (this.hasAssessmentReadBypass(access)) return;
    this.assertActorMatchesLearnerIamLink(tenantId, access.actorId, learnerId, access.permissions);
  }

  /**
   * Метаданные аудита для сценария «за слушателя» через IAM-право `learners.act_as`.
   */
  private delegatedLearningAuditMetadata(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    permissions?: string[]
  ): Record<string, unknown> | undefined {
    const learner = this.getById(this.state.learners, tenantId, learnerId);
    if (!learner.linkedIamUserId) return undefined;
    if (!permissions?.includes(LEARNERS_ACT_AS_PERMISSION)) return undefined;
    if (actorId && actorId === learner.linkedIamUserId) return undefined;
    return {
      delegated: true,
      learnerId,
      viaPermission: LEARNERS_ACT_AS_PERMISSION
    };
  }

  /**
   * Когда слушатель привязан к IAM-пользователю, мутации в его контексте недоступны другим пользователям
   * (соответствие anti-IDOR для прогресса, субмиссий и попытек). Исключение: право `learners.act_as`.
   */
  assertActorMatchesLearnerIamLink(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    permissions?: string[]
  ): void {
    const learner = this.getById(this.state.learners, tenantId, learnerId);
    if (!learner.linkedIamUserId) return;
    if (permissions?.includes(LEARNERS_ACT_AS_PERMISSION)) return;
    if (!actorId || actorId !== learner.linkedIamUserId) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Access denied for this learner enrollment or attempt context'
      });
    }
  }

  private ensureClaimedLearnerMatchesEnrollment(
    enrollmentLearnerId: string,
    claimedLearnerId: string
  ): void {
    if (claimedLearnerId !== enrollmentLearnerId) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'learnerId does not match enrollment learner'
      });
    }
  }

  private validateAssignmentReviewScore(
    tenantId: string,
    assignmentId: string,
    score: number | undefined
  ): void {
    if (score === undefined) {
      return;
    }
    if (score < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'score must be non-negative'
      });
    }
    const assignment = this.getById(this.state.assignments, tenantId, assignmentId);
    if (score > assignment.maxScore) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'score exceeds assignment maxScore'
      });
    }
  }

  private computePlannedEndAt(
    tenantId: string,
    groupId: string,
    enrolledAt: string
  ): string | undefined {
    const links = this.state.groupCourses.filter(
      (gc) => gc.tenantId === tenantId && gc.groupId === groupId
    );
    if (!links.length) return undefined;
    const base = Date.parse(enrolledAt);
    if (Number.isNaN(base)) return undefined;
    let maxEnd = base;
    for (const gc of links) {
      const days = gc.durationDays ?? DEFAULT_GROUP_COURSE_DURATION_DAYS;
      const end = base + days * 86_400_000;
      if (end > maxEnd) maxEnd = end;
    }
    return new Date(maxEnd).toISOString();
  }

  private dayBucket(enabled: boolean): string | undefined {
    if (!enabled) return undefined;
    return new Date().toISOString().slice(0, 10);
  }

  private list<T extends BaseEntity>(
    source: T[],
    tenantId: string,
    query: BaseFilterQuery
  ): ListResponse<T> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    let items = source.filter((item) => item.tenantId === tenantId);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }
    if (query.status) {
      items = items.filter((item) => item.status === query.status);
    }
    if (query.group_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).groupId ?? '') === query.group_id
      );
    }
    if (query.learner_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).learnerId ?? '') === query.learner_id
      );
    }
    if (query.course_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).courseId ?? '') === query.course_id
      );
    }
    if (query.course_version_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).courseVersionId ?? '') ===
          query.course_version_id
      );
    }
    if (query.module_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).moduleId ?? '') === query.module_id
      );
    }
    if (query.test_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).testId ?? '') === query.test_id
      );
    }
    if (query.enrollment_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).enrollmentId ?? '') === query.enrollment_id
      );
    }
    if (query.assignment_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).assignmentId ?? '') === query.assignment_id
      );
    }
    if (query.created_from) {
      const fromDate = new Date(query.created_from);
      if (!Number.isNaN(fromDate.getTime())) {
        items = items.filter((item) => new Date(item.createdAt) >= fromDate);
      }
    }
    if (query.created_to) {
      const toDate = new Date(query.created_to);
      if (!Number.isNaN(toDate.getTime())) {
        items = items.filter((item) => new Date(item.createdAt) <= toDate);
      }
    }
    if (query.planned_end_from) {
      const fromTs = Date.parse(query.planned_end_from);
      if (!Number.isNaN(fromTs)) {
        items = items.filter((item) => {
          const p = (item as Record<string, unknown>).plannedEndAt;
          if (!p || typeof p !== 'string') return false;
          return Date.parse(p) >= fromTs;
        });
      }
    }
    if (query.planned_end_to) {
      const toTs = Date.parse(query.planned_end_to);
      if (!Number.isNaN(toTs)) {
        items = items.filter((item) => {
          const p = (item as Record<string, unknown>).plannedEndAt;
          if (!p || typeof p !== 'string') return false;
          return Date.parse(p) <= toTs;
        });
      }
    }
    if (query.sort) {
      const [rawKey, direction] = query.sort.split(':');
      const key = rawKey ?? 'id';
      items = [...items].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[key] ?? '');
        const bv = String((b as Record<string, unknown>)[key] ?? '');
        return direction === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    const total = items.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return { items: items.slice(from, to), page, pageSize, total };
  }

  private lookup<T extends BaseEntity>(
    source: T[],
    tenantId: string,
    query: BaseFilterQuery,
    labelResolver: (item: T) => string
  ): ListResponse<LookupItem> {
    const listed = this.list(source, tenantId, query);
    return {
      ...listed,
      items: listed.items.map((item) => ({
        id: item.id,
        label: labelResolver(item),
        status: item.status
      }))
    };
  }

  // === Pillar A — Plan A (§5.5): regulatory acts lookup ===

  listRegulatoryActs(): RegulatoryAct[] {
    return REGULATORY_ACTS_SEED;
  }

  // === Wave 2 — ОТ-реестр: программы обучения (lookup) ===

  listFrdoDocumentKinds(): FrdoDocumentKind[] {
    return FRDO_DOCUMENT_KINDS_SEED.filter((k) => k.isActive);
  }

  listOtTrainingPrograms(): OtTrainingProgram[] {
    return OT_TRAINING_PROGRAMS_SEED.filter((p) => p.isActive).sort(
      (a, b) => a.registryId - b.registryId
    );
  }

  // === Pillar A — Plan A (§5.2): commissions ===

  listCommissions(tenantId: string, status?: CommissionStatus): Commission[] {
    return this.state.commissions
      .filter((c) => c.tenantId === tenantId && (!status || c.status === status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getCommission(tenantId: string, id: string): Commission {
    return this.getById(this.state.commissions, tenantId, id);
  }

  createCommission(
    tenantId: string,
    actorId: string | undefined,
    request: CreateCommissionRequest,
    context: RequestContext
  ): Commission {
    const duplicate = this.state.commissions.find(
      (c) => c.tenantId === tenantId && c.code === request.code
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'commission_code_conflict',
        message: `Commission with code ${request.code} already exists in tenant`
      });
    }
    const entity: Commission = {
      id: this.id('commission'),
      tenantId,
      code: request.code,
      name: request.name,
      description: request.description,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.commissions.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.commission_created',
      'learning.commission',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateCommission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateCommissionRequest,
    context: RequestContext
  ): Commission {
    const current = this.getById(this.state.commissions, tenantId, id);
    const oldValues = { ...current };
    if (request.name !== undefined) current.name = request.name;
    if (request.description !== undefined) current.description = request.description;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.commission_updated',
      'learning.commission',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  archiveCommission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Commission {
    const current = this.getById(this.state.commissions, tenantId, id);
    if (current.status === 'archived') return current;
    const oldValues = { ...current };
    current.status = 'archived';
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.commission_archived',
      'learning.commission',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listCommissionMembers(tenantId: string, commissionId: string): CommissionMember[] {
    return this.state.commissionMembers
      .filter((m) => m.tenantId === tenantId && m.commissionId === commissionId)
      .sort((a, b) => a.positionInOrder - b.positionInOrder);
  }

  addCommissionMember(
    tenantId: string,
    actorId: string | undefined,
    commissionId: string,
    request: AddCommissionMemberRequest,
    context: RequestContext
  ): CommissionMember {
    const commission = this.getById(this.state.commissions, tenantId, commissionId);
    if (commission.status === 'archived') {
      throw new BadRequestException({
        code: 'commission_archived',
        message: 'Cannot add member to archived commission'
      });
    }
    if (!request.userId && !request.externalFullName) {
      throw new BadRequestException({
        code: 'commission_member_identity_required',
        message: 'Either userId or externalFullName is required'
      });
    }
    const entity: CommissionMember = {
      id: this.id('commission_member'),
      tenantId,
      commissionId,
      role: request.role,
      userId: request.userId,
      externalFullName: request.externalFullName,
      externalPosition: request.externalPosition,
      signatureFileId: request.signatureFileId,
      positionInOrder: request.positionInOrder,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.commissionMembers.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.commission_member_added',
      'learning.commission_member',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  removeCommissionMember(
    tenantId: string,
    actorId: string | undefined,
    commissionId: string,
    memberId: string,
    context: RequestContext
  ): void {
    this.getById(this.state.commissions, tenantId, commissionId);
    const idx = this.state.commissionMembers.findIndex(
      (m) => m.id === memberId && m.tenantId === tenantId && m.commissionId === commissionId
    );
    if (idx === -1) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Commission member not found'
      });
    }
    const [removed] = this.state.commissionMembers.splice(idx, 1);
    if (!removed) return;
    this.audit(
      tenantId,
      actorId,
      'learning.commission_member_removed',
      'learning.commission_member',
      removed.id,
      removed,
      undefined,
      context
    );
  }

  // === Pillar A — Plan A (§5.1): program meta + publish course version ===

  updateProgramMeta(
    tenantId: string,
    actorId: string | undefined,
    courseVersionId: string,
    request: UpdateProgramMetaRequest,
    context: RequestContext
  ): CourseVersion {
    const cv = this.getById(this.state.courseVersions, tenantId, courseVersionId);
    if (cv.status !== 'draft') {
      throw new BadRequestException({
        code: 'course_version_not_editable',
        message: 'Cannot edit program meta of a non-draft course version'
      });
    }
    if (request.commissionId !== undefined) {
      const commission = this.state.commissions.find(
        (c) => c.tenantId === tenantId && c.id === request.commissionId
      );
      if (!commission) {
        throw new BadRequestException({
          code: 'commission_not_found',
          message: `Commission ${request.commissionId} not found`
        });
      }
      if (commission.status === 'archived') {
        throw new BadRequestException({
          code: 'commission_archived',
          message: 'Cannot attach archived commission'
        });
      }
    }

    const oldValues = { ...cv };
    if (request.academicHours !== undefined) cv.academicHours = request.academicHours;
    if (request.recertificationPeriodMonths !== undefined)
      cv.recertificationPeriodMonths = request.recertificationPeriodMonths;
    if (request.trainingType !== undefined) cv.trainingType = request.trainingType;
    if (request.learnerCategory !== undefined) cv.learnerCategory = request.learnerCategory;
    if (request.studyForm !== undefined) cv.studyForm = request.studyForm;
    if (request.finalAssessmentForm !== undefined) {
      cv.finalAssessmentForm = request.finalAssessmentForm;
    }
    if (request.regulatoryBasisCodes !== undefined) {
      cv.regulatoryBasisCodes = request.regulatoryBasisCodes;
    }
    if (request.programAttachmentFileId !== undefined) {
      cv.programAttachmentFileId = request.programAttachmentFileId;
    }
    if (request.commissionId !== undefined) cv.commissionId = request.commissionId;
    if (request.otProgramCodes !== undefined) cv.otProgramCodes = request.otProgramCodes;
    cv.updatedAt = this.now();

    this.audit(
      tenantId,
      actorId,
      'learning.course_version_program_meta_updated',
      'learning.course_version',
      cv.id,
      oldValues,
      cv,
      context
    );
    return cv;
  }

  // === Pillar A — Plan A (§5.3): course document sets ===

  getCourseDocumentSet(tenantId: string, courseVersionId: string): CourseDocumentSetEntry[] {
    return this.state.courseDocumentSets
      .filter((e) => e.tenantId === tenantId && e.courseVersionId === courseVersionId)
      .sort((a, b) => a.position - b.position);
  }

  setCourseDocumentSet(
    tenantId: string,
    actorId: string | undefined,
    courseVersionId: string,
    request: PutCourseDocumentSetRequest,
    context: RequestContext
  ): CourseDocumentSetEntry[] {
    this.getById(this.state.courseVersions, tenantId, courseVersionId);

    const positions = request.entries.map((e) => e.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i) {
        throw new BadRequestException({
          code: 'course_document_set_positions_invalid',
          message: `Positions must be sequential 0..N-1, got [${positions.join(',')}]`
        });
      }
    }

    for (const entry of request.entries) {
      try {
        this.documentsService.getTemplate(tenantId, entry.templateId);
      } catch {
        throw new BadRequestException({
          code: 'template_not_found',
          message: `Template ${entry.templateId} not found in tenant`
        });
      }
    }

    const oldEntries = this.getCourseDocumentSet(tenantId, courseVersionId);
    this.state.courseDocumentSets = this.state.courseDocumentSets.filter(
      (e) => !(e.tenantId === tenantId && e.courseVersionId === courseVersionId)
    );

    const created: CourseDocumentSetEntry[] = [];
    for (const e of request.entries) {
      const entity: CourseDocumentSetEntry = {
        id: this.id('course_doc_set'),
        tenantId,
        courseVersionId,
        templateId: e.templateId,
        position: e.position,
        isRequired: e.isRequired,
        autoIssueOnCompletion: e.autoIssueOnCompletion,
        createdAt: this.now(),
        updatedAt: this.now()
      };
      this.state.courseDocumentSets.push(entity);
      created.push(entity);
    }

    this.audit(
      tenantId,
      actorId,
      'learning.course_document_set_updated',
      'learning.course_version',
      courseVersionId,
      { entries: oldEntries.length },
      { entries: created.length },
      context
    );

    return created.sort((a, b) => a.position - b.position);
  }

  async publishCourseVersion(
    tenantId: string,
    actorId: string | undefined,
    courseVersionId: string,
    context: RequestContext
  ): Promise<CourseVersion> {
    const cv = this.getById(this.state.courseVersions, tenantId, courseVersionId);
    if (cv.status === 'published') return cv;

    const missing: string[] = [];
    if (cv.academicHours == null) missing.push('academicHours');
    if (!cv.trainingType) missing.push('trainingType');
    if (!cv.learnerCategory) missing.push('learnerCategory');
    if (!cv.studyForm) missing.push('studyForm');
    if (!cv.finalAssessmentForm) missing.push('finalAssessmentForm');
    if (!cv.regulatoryBasisCodes || cv.regulatoryBasisCodes.length === 0) {
      missing.push('regulatoryBasisCodes');
    }
    if (!cv.commissionId) missing.push('commissionId');
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'program_meta_incomplete',
        message: `Cannot publish: missing required fields ${missing.join(', ')}`
      });
    }

    const commission = this.state.commissions.find(
      (c) => c.tenantId === tenantId && c.id === cv.commissionId
    );
    if (!commission || commission.status !== 'active') {
      throw new BadRequestException({
        code: 'commission_not_active',
        message: 'Attached commission is not active'
      });
    }

    // Pillar A Plan C §5.10 — публикация blocked, если нет matching active license.
    // Optional injection: in legacy/unit tests без OrgModule валидация лицензии skipped.
    if (this.licensesService && cv.trainingType) {
      const matching = await this.licensesService.findActiveLicensesFor(tenantId, cv.trainingType);
      if (matching.length === 0) {
        throw new BadRequestException({
          code: 'no_matching_license',
          message: 'У центра нет активной лицензии на этот вид подготовки'
        });
      }
    }

    const oldValues = { ...cv };
    cv.status = 'published';
    cv.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_version_published',
      'learning.course_version',
      cv.id,
      oldValues,
      cv,
      context
    );
    return cv;
  }

  /**
   * Phase 5C-2 — настроенные email сотрудников тенанта для staff-копии уведомлений.
   * Возвращает нормализованный список (как хранится). Пусто = функция выключена (opt-in).
   */
  getNotificationStaffRecipients(tenantId: string): string[] {
    return this.state.notificationStaffRecipients
      .filter((r) => r.tenantId === tenantId)
      .map((r) => r.email);
  }

  /**
   * Заменяет список staff-получателей тенанта целиком. Нормализует (trim+lowercase),
   * отбрасывает пустые, дедуплицирует с сохранением порядка. Пустой массив выключает копии.
   */
  setNotificationStaffRecipients(
    tenantId: string,
    actorId: string | undefined,
    emails: string[],
    context: RequestContext
  ): string[] {
    const normalized: string[] = [];
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (email && !normalized.includes(email)) normalized.push(email);
    }
    const oldValues = this.getNotificationStaffRecipients(tenantId);
    this.state.notificationStaffRecipients = [
      ...this.state.notificationStaffRecipients.filter((r) => r.tenantId !== tenantId),
      ...normalized.map((email) => ({ tenantId, email }))
    ];
    this.audit(
      tenantId,
      actorId,
      'communication.staff_recipients_updated',
      'communication.notification_settings',
      tenantId,
      { emails: oldValues },
      { emails: normalized },
      context
    );
    return normalized;
  }

  private getById<T extends BaseEntity>(source: T[], tenantId: string, id: string): T {
    const result = source.find((item) => item.id === id && item.tenantId === tenantId);
    if (!result) {
      throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    }
    this.tenantScopedRepository.enforceTenantScope(tenantId, result.tenantId);
    return result;
  }

  private id(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private normalizePercent(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
  }

  private audit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
    context: RequestContext,
    metadata?: Record<string, unknown>
  ): void {
    this.auditService.write({
      tenantId,
      actorId,
      action,
      entityType,
      entityId,
      oldValues: oldValues as Record<string, unknown> | undefined,
      newValues: newValues as Record<string, unknown> | undefined,
      metadata,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
  }
}
