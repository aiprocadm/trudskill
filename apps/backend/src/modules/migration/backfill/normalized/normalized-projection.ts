import { createHash } from 'node:crypto';

import {
  encryptDocumentSnapshotAtRest,
  encryptLearnerPiiAtRest
} from '../../../../infrastructure/crypto/pii-crypto.js';

/**
 * Проекция сущностей JSON-снимка в колонки нормализованных таблиц (ТЗ перехода с CDOPROF,
 * Фаза 1, срез 0b — МГ-A1.2 «бэкфилл из снимка с отчётом сверки»).
 *
 * Чистые функции без базы: сервис бэкфилла подставляет контекст (какие ссылки существуют),
 * а здесь решается, что ляжет в колонку, что — в `payload`, и что считать одинаковым при
 * сверке. Правила, которые нельзя угадать по названию колонки:
 *
 *   • ПДн слушателя в открытом виде в таблицу не пишутся: `snils/email/phone/dateOfBirth`
 *     проходят через `encryptLearnerPiiAtRest` (идемпотентна — legacy-открытые значения
 *     дошифровываются здесь же) и ложатся в `*_enc`; слепой индекс — в `snils_hash`;
 *   • поле, у которого нет колонки, не теряется — уходит в `payload` (кроме таблиц без
 *     `payload`: там его нет по построению, список полей закрыт);
 *   • статус вне CHECK таблицы не роняет строку: в колонку — безопасное значение
 *     («не активен» / «черновик»), исходное — в `payload.sourceStatus`;
 *   • ссылка на несуществующую строку (контрагент у группы, файл у документа, учётная
 *     запись у слушателя) обнуляется с сохранением в `payload`, чтобы FK не отклонил строку;
 *     ссылка зачисления на группу и слушателя НЕ обнуляется — это ошибка данных, и строка
 *     должна попасть в отчёт как отказ;
 *   • `is_final` у документа считается из статуса (0003: `is_final ⇒ status = 'final'`),
 *     а не берётся из сущности: отозванный «финальный» документ иначе не вставится.
 */

export const HOT_COLLECTIONS = [
  'counterparties',
  'learners',
  'groups',
  'groupCourses',
  'enrollments',
  'enrollmentStatusHistory',
  'examResults',
  'generatedDocuments'
] as const;
export type HotCollection = (typeof HOT_COLLECTIONS)[number];

export type ColumnType = 'text' | 'num' | 'int' | 'bool' | 'ts' | 'date' | 'json';

export type SnapshotSource = 'learning.mvp_runtime_documents' | 'documents.runtime_documents';

export interface TableSpec {
  table: string;
  source: SnapshotSource;
  /** Колонки, которые пишет бэкфилл, с типом для нормализации значений при сверке. */
  columns: Record<string, ColumnType>;
  hasPayload: boolean;
}

const BASE_COLUMNS: Record<string, ColumnType> = {
  id: 'text',
  tenant_id: 'text',
  created_at: 'ts',
  updated_at: 'ts'
};

export const TABLE_SPECS: Record<HotCollection, TableSpec> = {
  counterparties: {
    table: 'crm.counterparties',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      code: 'text',
      name: 'text',
      legal_name: 'text',
      inn: 'text',
      kpp: 'text',
      contact_email: 'text',
      contact_phone: 'text',
      legal_address: 'text',
      note: 'text',
      status: 'text',
      external_id: 'text',
      source_system: 'text'
    }
  },
  learners: {
    table: 'learning.learners',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      user_id: 'text',
      learner_no: 'text',
      first_name: 'text',
      last_name: 'text',
      middle_name: 'text',
      position: 'text',
      organization_unit_id: 'text',
      snils_enc: 'text',
      snils_hash: 'text',
      email_enc: 'text',
      phone_enc: 'text',
      birth_date_enc: 'text',
      status: 'text',
      external_id: 'text',
      source_system: 'text',
      legacy_login: 'text'
    }
  },
  groups: {
    table: 'learning.groups',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      code: 'text',
      name: 'text',
      status: 'text',
      counterparty_id: 'text',
      external_id: 'text',
      source_system: 'text',
      legacy_number: 'text'
    }
  },
  groupCourses: {
    table: 'learning.group_courses',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      group_id: 'text',
      course_id: 'text',
      course_version_id: 'text',
      sort_order: 'int',
      duration_days: 'int',
      requires_pre_exam_auth: 'bool',
      requires_identity_verification: 'bool',
      requires_proctoring: 'bool',
      status: 'text'
    }
  },
  enrollments: {
    table: 'learning.enrollments',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      group_id: 'text',
      learner_id: 'text',
      status: 'text',
      enrolled_at: 'ts',
      completed_at: 'ts',
      planned_end_at: 'ts',
      proctoring_override: 'text',
      external_id: 'text',
      source_system: 'text'
    }
  },
  enrollmentStatusHistory: {
    table: 'learning.enrollment_status_history',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      id: 'text',
      tenant_id: 'text',
      created_at: 'ts',
      enrollment_id: 'text',
      status: 'text',
      changed_at: 'ts',
      reason: 'text'
    }
  },
  examResults: {
    table: 'assessment.exam_results',
    source: 'learning.mvp_runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      enrollment_id: 'text',
      learner_id: 'text',
      test_id: 'text',
      best_attempt_id: 'text',
      final_score: 'num',
      is_passed: 'bool',
      status: 'text',
      finalized_at: 'ts',
      attempts_count: 'int',
      best_score: 'num',
      max_score: 'num',
      passing_score: 'num'
    }
  },
  generatedDocuments: {
    table: 'documents.generated_documents',
    source: 'documents.runtime_documents',
    hasPayload: true,
    columns: {
      ...BASE_COLUMNS,
      template_id: 'text',
      template_version_id: 'text',
      source_entity_type: 'text',
      source_entity_id: 'text',
      learner_id: 'text',
      group_id: 'text',
      counterparty_id: 'text',
      storage_file_id: 'text',
      status: 'text',
      is_final: 'bool',
      document_number: 'text',
      document_date: 'date',
      generated_at: 'ts',
      finalized_at: 'ts',
      valid_until: 'date',
      archived_at: 'ts',
      group_order_document_id: 'text',
      qr_token: 'text',
      revoked_at: 'ts',
      revoked_by: 'text',
      revocation_reason: 'text',
      replaces_document_id: 'text',
      replaced_by_document_id: 'text',
      variables_snapshot: 'json',
      document_type: 'text',
      kind_code: 'text',
      name: 'text',
      pdf_file_id: 'text',
      enrollment_id: 'text',
      external_id: 'text',
      source_system: 'text',
      is_external: 'bool'
    }
  }
};

/** Что бэкфилл уже знает о соседях строки — заполняется сервисом одним запросом на пачку. */
export interface ProjectionContext {
  enrollments: Map<string, { groupId: string; learnerId: string }>;
  groups: Map<string, { counterpartyId: string | null }>;
  users: Set<string>;
  files: Set<string>;
  counterparties: Set<string>;
}

export const emptyContext = (): ProjectionContext => ({
  enrollments: new Map(),
  groups: new Map(),
  users: new Set(),
  files: new Set(),
  counterparties: new Set()
});

export interface ProjectedRow {
  columns: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/** Строка не ложится в таблицу по вине данных — текст понятен человеку, попадёт в отчёт. */
export class ProjectionError extends Error {}

type Entity = Record<string, unknown>;

const ENTITY_STATUS_TRIPLE = new Set(['active', 'inactive', 'archived']);
const GROUP_STATUSES = new Set([
  'draft',
  'scheduled',
  'recruiting',
  'active',
  'in_progress',
  'exam',
  'documents',
  'completed',
  'closed',
  'archived',
  'cancelled'
]);
const ENROLLMENT_STATUSES = new Set(['pending', 'active', 'suspended', 'completed', 'cancelled']);
const EXAM_RESULT_STATUSES = new Set(['draft', 'final', 'void', 'active', 'needs_review']);
const DOCUMENT_STATUSES = new Set([
  'draft',
  'generated',
  'final',
  'issued',
  'archived',
  'revoked',
  'cancelled',
  'void'
]);
const INN_FORMAT = /^(\d{10}|\d{12})$/;

/** Поля сущности, которые никогда не идут в payload: у них есть колонка или они служебные. */
const SERVICE_FIELDS = new Set(['id', 'tenantId', 'createdAt', 'updatedAt']);

const str = (value: unknown): string | null =>
  value === undefined || value === null || value === '' ? null : String(value);
const num = (value: unknown): number | null =>
  value === undefined || value === null || value === '' || Number.isNaN(Number(value))
    ? null
    : Number(value);
const bool = (value: unknown): boolean => value === true || value === 'true';
const req = (entity: Entity, field: string, what: string): string => {
  const value = str(entity[field]);
  if (value === null) {
    throw new ProjectionError(`у ${what} нет обязательного поля «${field}»`);
  }
  return value;
};

/**
 * Собирает строку: `mapped` — поле сущности → колонка; все остальные поля сущности, кроме
 * служебных и перечисленных в `consumed`, уходят в `payload`.
 */
const assemble = (
  entity: Entity,
  tenantId: string,
  columns: Record<string, unknown>,
  consumed: ReadonlyArray<string>,
  payloadExtra: Record<string, unknown> = {}
): ProjectedRow => {
  const payload: Record<string, unknown> = { ...payloadExtra };
  const used = new Set([...SERVICE_FIELDS, ...consumed]);
  for (const [key, value] of Object.entries(entity)) {
    if (!used.has(key) && value !== undefined) payload[key] = value;
  }
  return {
    columns: {
      id: req(entity, 'id', 'сущности'),
      tenant_id: tenantId,
      created_at: str(entity.createdAt),
      updated_at: str(entity.updatedAt),
      ...columns
    },
    payload
  };
};

const safeStatus = (
  raw: unknown,
  allowed: Set<string>,
  fallback: string
): { status: string; extra: Record<string, unknown> } => {
  const status = str(raw) ?? fallback;
  return allowed.has(status)
    ? { status, extra: {} }
    : { status: fallback, extra: { sourceStatus: status } };
};

const projectCounterparty = (entity: Entity, tenantId: string): ProjectedRow => {
  const { status, extra } = safeStatus(entity.status, ENTITY_STATUS_TRIPLE, 'inactive');
  const inn = str(entity.inn);
  const innOk = inn === null || INN_FORMAT.test(inn);
  return assemble(
    entity,
    tenantId,
    {
      code: req(entity, 'code', 'контрагента'),
      name: req(entity, 'name', 'контрагента'),
      legal_name: str(entity.legalName),
      inn: innOk ? inn : null,
      kpp: str(entity.kpp),
      contact_email: str(entity.contactEmail),
      contact_phone: str(entity.contactPhone),
      legal_address: str(entity.legalAddress),
      note: str(entity.note),
      status,
      external_id: str(entity.externalId),
      source_system: str(entity.sourceSystem)
    },
    [
      'code',
      'name',
      'legalName',
      'inn',
      'kpp',
      'contactEmail',
      'contactPhone',
      'legalAddress',
      'note',
      'status',
      'externalId',
      'sourceSystem'
    ],
    { ...extra, ...(innOk ? {} : { inn }) }
  );
};

const projectLearner = (entity: Entity, tenantId: string, ctx: ProjectionContext): ProjectedRow => {
  const atRest = encryptLearnerPiiAtRest(entity) as Entity;
  const { status, extra } = safeStatus(atRest.status, ENTITY_STATUS_TRIPLE, 'inactive');
  const linked = str(atRest.linkedIamUserId);
  const userKnown = linked !== null && ctx.users.has(linked);
  return assemble(
    atRest,
    tenantId,
    {
      user_id: userKnown ? linked : null,
      learner_no: str(atRest.learnerNo),
      first_name: str(atRest.firstName) ?? '',
      last_name: str(atRest.lastName) ?? '',
      middle_name: str(atRest.middleName),
      position: str(atRest.position),
      organization_unit_id: str(atRest.organizationUnitId),
      snils_enc: str(atRest.snils),
      snils_hash: str(atRest.snilsHash),
      email_enc: str(atRest.email),
      phone_enc: str(atRest.phone),
      birth_date_enc: str(atRest.dateOfBirth),
      status,
      external_id: str(atRest.externalId),
      source_system: str(atRest.sourceSystem),
      legacy_login: str(atRest.legacyLogin)
    },
    [
      'linkedIamUserId',
      'learnerNo',
      'firstName',
      'lastName',
      'middleName',
      'position',
      'organizationUnitId',
      'snils',
      'snilsHash',
      'email',
      'phone',
      'dateOfBirth',
      'status',
      'externalId',
      'sourceSystem',
      'legacyLogin'
    ],
    { ...extra, ...(linked !== null && !userKnown ? { linkedIamUserId: linked } : {}) }
  );
};

const projectGroup = (entity: Entity, tenantId: string, ctx: ProjectionContext): ProjectedRow => {
  const { status, extra } = safeStatus(entity.status, GROUP_STATUSES, 'draft');
  const counterpartyId = str(entity.counterpartyId);
  const known = counterpartyId !== null && ctx.counterparties.has(counterpartyId);
  return assemble(
    entity,
    tenantId,
    {
      code: req(entity, 'code', 'группы'),
      name: req(entity, 'name', 'группы'),
      status,
      counterparty_id: known ? counterpartyId : null,
      external_id: str(entity.externalId),
      source_system: str(entity.sourceSystem),
      legacy_number: str(entity.legacyNumber)
    },
    ['code', 'name', 'status', 'counterpartyId', 'externalId', 'sourceSystem', 'legacyNumber'],
    { ...extra, ...(counterpartyId !== null && !known ? { counterpartyId } : {}) }
  );
};

const projectGroupCourse = (entity: Entity, tenantId: string): ProjectedRow =>
  assemble(
    entity,
    tenantId,
    {
      group_id: req(entity, 'groupId', 'курса группы'),
      course_id: req(entity, 'courseId', 'курса группы'),
      course_version_id: str(entity.courseVersionId),
      sort_order: num(entity.sortOrder) ?? 0,
      duration_days: num(entity.durationDays),
      requires_pre_exam_auth: bool(entity.requiresPreExamAuth),
      requires_identity_verification: bool(entity.requiresIdentityVerification),
      requires_proctoring: bool(entity.requiresProctoring),
      status: str(entity.status) ?? 'active'
    },
    [
      'groupId',
      'courseId',
      'courseVersionId',
      'sortOrder',
      'durationDays',
      'requiresPreExamAuth',
      'requiresIdentityVerification',
      'requiresProctoring',
      'status'
    ]
  );

const projectEnrollment = (entity: Entity, tenantId: string): ProjectedRow => {
  const { status, extra } = safeStatus(entity.status, ENROLLMENT_STATUSES, 'pending');
  const completedAt =
    str(entity.completedAt) ?? (status === 'completed' ? str(entity.updatedAt) : null);
  return assemble(
    entity,
    tenantId,
    {
      group_id: req(entity, 'groupId', 'зачисления'),
      learner_id: req(entity, 'learnerId', 'зачисления'),
      status,
      enrolled_at: str(entity.enrolledAt) ?? str(entity.createdAt),
      completed_at: completedAt,
      planned_end_at: str(entity.plannedEndAt),
      proctoring_override: str(entity.proctoringOverride),
      external_id: str(entity.externalId),
      source_system: str(entity.sourceSystem)
    },
    [
      'groupId',
      'learnerId',
      'status',
      'enrolledAt',
      'completedAt',
      'plannedEndAt',
      'proctoringOverride',
      'externalId',
      'sourceSystem'
    ],
    extra
  );
};

const projectStatusHistory = (entity: Entity, tenantId: string): ProjectedRow => {
  const { status, extra } = safeStatus(entity.status, ENROLLMENT_STATUSES, 'pending');
  const row = assemble(
    entity,
    tenantId,
    {
      enrollment_id: req(entity, 'enrollmentId', 'записи истории'),
      status,
      changed_at: str(entity.changedAt) ?? str(entity.createdAt),
      reason: str(entity.reason)
    },
    ['enrollmentId', 'status', 'changedAt', 'reason'],
    extra
  );
  // У истории нет updated_at, а created_at берём из момента смены.
  delete row.columns.updated_at;
  row.columns.created_at = row.columns.created_at ?? row.columns.changed_at;
  return row;
};

const projectExamResult = (entity: Entity, tenantId: string): ProjectedRow => {
  const { status, extra } = safeStatus(entity.status, EXAM_RESULT_STATUSES, 'draft');
  return assemble(
    entity,
    tenantId,
    {
      enrollment_id: req(entity, 'enrollmentId', 'результата экзамена'),
      learner_id: req(entity, 'learnerId', 'результата экзамена'),
      test_id: req(entity, 'testId', 'результата экзамена'),
      best_attempt_id: str(entity.bestAttemptId),
      final_score: num(entity.finalScore),
      is_passed: bool(entity.passed),
      status,
      finalized_at: str(entity.finalizedAt) ?? str(entity.updatedAt) ?? str(entity.createdAt),
      attempts_count: num(entity.attemptsCount) ?? 0,
      best_score: num(entity.bestScore),
      max_score: num(entity.maxScore),
      passing_score: num(entity.passingScore)
    },
    [
      'enrollmentId',
      'learnerId',
      'testId',
      'bestAttemptId',
      'finalScore',
      'passed',
      'status',
      'finalizedAt',
      'attemptsCount',
      'bestScore',
      'maxScore',
      'passingScore'
    ],
    extra
  );
};

const projectGeneratedDocument = (
  entity: Entity,
  tenantId: string,
  ctx: ProjectionContext
): ProjectedRow => {
  const atRest = encryptDocumentSnapshotAtRest(entity) as Entity;
  const { status, extra } = safeStatus(atRest.status, DOCUMENT_STATUSES, 'draft');
  const isFinal = status === 'final';
  const sourceType = req(atRest, 'sourceEntityType', 'документа');
  const sourceId = req(atRest, 'sourceEntityId', 'документа');
  const generatedAt = str(atRest.generatedAt) ?? str(atRest.createdAt);
  const fileId = str(atRest.fileId);
  const fileKnown = fileId !== null && ctx.files.has(fileId);

  const enrollment = sourceType === 'enrollment' ? ctx.enrollments.get(sourceId) : undefined;
  const groupId = enrollment?.groupId ?? (sourceType === 'group' ? sourceId : null);
  const group = groupId ? ctx.groups.get(groupId) : undefined;
  const documentDate = str(atRest.documentDate) ?? (isFinal ? generatedAt?.slice(0, 10) : null);

  const payloadExtra: Record<string, unknown> = { ...extra };
  if (atRest.isFinal !== undefined && bool(atRest.isFinal) !== isFinal)
    payloadExtra.isFinal = atRest.isFinal;
  if (fileId !== null && !fileKnown) payloadExtra.fileId = fileId;

  return assemble(
    atRest,
    tenantId,
    {
      template_id: str(atRest.templateId),
      template_version_id: str(atRest.templateVersionId),
      source_entity_type: sourceType,
      source_entity_id: sourceId,
      learner_id: enrollment?.learnerId ?? null,
      group_id: group ? groupId : null,
      counterparty_id: group?.counterpartyId ?? null,
      storage_file_id: fileKnown ? fileId : null,
      status,
      is_final: isFinal,
      document_number: str(atRest.documentNumber),
      document_date: documentDate ? documentDate.slice(0, 10) : null,
      generated_at: generatedAt,
      finalized_at: isFinal ? (str(atRest.finalizedAt) ?? generatedAt) : null,
      valid_until: str(atRest.validUntil)?.slice(0, 10) ?? null,
      archived_at: str(atRest.archivedAt),
      group_order_document_id: str(atRest.groupOrderDocumentId),
      qr_token: str(atRest.qrToken),
      revoked_at: str(atRest.revokedAt),
      revoked_by: str(atRest.revokedBy),
      revocation_reason: str(atRest.revocationReason),
      replaces_document_id: str(atRest.replacesDocumentId),
      replaced_by_document_id: str(atRest.replacedByDocumentId),
      variables_snapshot: atRest.variablesSnapshot ?? null,
      document_type: str(atRest.documentType),
      kind_code: str(atRest.kindCode) ?? str(atRest.documentType),
      name: str(atRest.name),
      pdf_file_id: str(atRest.pdfFileId),
      enrollment_id: enrollment ? sourceId : null,
      external_id: str(atRest.externalId),
      source_system: str(atRest.sourceSystem),
      is_external: bool(atRest.isExternal)
    },
    [
      'templateId',
      'templateVersionId',
      'sourceEntityType',
      'sourceEntityId',
      'fileId',
      'status',
      'isFinal',
      'documentNumber',
      'documentDate',
      'generatedAt',
      'finalizedAt',
      'validUntil',
      'archivedAt',
      'groupOrderDocumentId',
      'qrToken',
      'revokedAt',
      'revokedBy',
      'revocationReason',
      'replacesDocumentId',
      'replacedByDocumentId',
      'variablesSnapshot',
      'documentType',
      'kindCode',
      'name',
      'pdfFileId',
      'externalId',
      'sourceSystem',
      'isExternal'
    ],
    payloadExtra
  );
};

export function projectEntity(
  collection: HotCollection,
  tenantId: string,
  data: unknown,
  ctx: ProjectionContext
): ProjectedRow {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ProjectionError('запись снимка — не объект');
  }
  const entity = data as Entity;
  switch (collection) {
    case 'counterparties':
      return projectCounterparty(entity, tenantId);
    case 'learners':
      return projectLearner(entity, tenantId, ctx);
    case 'groups':
      return projectGroup(entity, tenantId, ctx);
    case 'groupCourses':
      return projectGroupCourse(entity, tenantId);
    case 'enrollments':
      return projectEnrollment(entity, tenantId);
    case 'enrollmentStatusHistory':
      return projectStatusHistory(entity, tenantId);
    case 'examResults':
      return projectExamResult(entity, tenantId);
    case 'generatedDocuments':
      return projectGeneratedDocument(entity, tenantId, ctx);
  }
}

/** Служебные колонки, которые в сверке не участвуют: базa проставляет их сама. */
const HASH_EXCLUDED = new Set(['created_at', 'updated_at']);

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }
  return value;
};

/**
 * Значение к одному виду для обеих сторон сверки: из снимка приходят строки и числа JSON,
 * из базы — `Date`, строки numeric («12.50») и `date` («2026-09-02»).
 */
export function normalizeForHash(type: ColumnType, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (type) {
    case 'num':
    case 'int':
      return String(Number(value));
    case 'bool':
      return String(value === true || value === 'true' || value === 't');
    case 'ts':
      return new Date(value as string | Date).toISOString();
    case 'date':
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    case 'json':
      return JSON.stringify(sortJson(typeof value === 'string' ? safeParse(value) : value));
    default:
      return String(value);
  }
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** sha256 канонической проекции — одинаков для строки снимка и перечитанной строки таблицы. */
export function canonicalHash(spec: TableSpec, columns: Record<string, unknown>): string {
  const canonical: Record<string, string | null> = {};
  for (const name of Object.keys(spec.columns).sort()) {
    if (HASH_EXCLUDED.has(name)) continue;
    canonical[name] = normalizeForHash(spec.columns[name]!, columns[name]);
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
