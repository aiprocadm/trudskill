export type TemplateStatus = 'active' | 'archived';
export type TemplateBindingType = 'direction' | 'course' | 'group';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type GeneratedDocumentStatus = 'generated' | 'final' | 'archived' | 'revoked';
export type NumberResetPeriod = 'none' | 'year' | 'month';

/**
 * §5.4 — все типы документных шаблонов в Pillar A.
 * 7 регулируемых (certificate/protocol/order/diploma/attestation/reference/report)
 * + 'contract' grandfathered из существующих seed-данных (см. migration 0032 comment).
 */
export type TemplateType =
  | 'certificate'
  | 'protocol'
  | 'order'
  | 'diploma'
  | 'attestation'
  | 'reference'
  | 'report'
  | 'contract';

/**
 * §5.5 — все категории переменных, поддерживаемые DocumentsService resolver'ом.
 * Зафиксированы CHECK-constraint'ом в migration 0032.
 */
export type VariableCategoryCode =
  | 'tenant'
  | 'group'
  | 'learner'
  | 'counterparty'
  | 'course'
  | 'commission'
  | 'document'
  | 'program'
  | 'enrollment'
  | 'group_learners';

export interface TemplateEntity {
  id: string;
  tenantId: string;
  name: string;
  templateType: string;
  description?: string;
  status: TemplateStatus;
  currentVersionId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersionEntity {
  id: string;
  tenantId: string;
  templateId: string;
  versionNo: number;
  fileId: string;
  variablesSchema: Record<string, unknown>;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface TemplateVariableEntity {
  id: string;
  tenantId: string;
  templateVersionId: string;
  variableCode: string;
  displayName: string;
  categoryCode: string;
  dataType: string;
  isRequired: boolean;
  description?: string;
  deletedAt?: string;
}

export interface TemplateBindingEntity {
  id: string;
  tenantId: string;
  templateId: string;
  bindType: TemplateBindingType;
  directionId?: string;
  courseId?: string;
  groupId?: string;
  attachMode: string;
  inheritToChildren: boolean;
  priority: number;
  createdAt: string;
}

export interface DocumentGenerationTaskEntity {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersionId?: string;
  documentType: string;
  taskType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  status: TaskStatus;
  requestedBy?: string;
  requestedAt: string;
  requestId?: string;
  correlationId?: string;
  /** Pillar A hardening — HTTP context оригинального запроса для audit. */
  ip?: string;
  userAgent?: string;
  outboxPayload?: {
    request_id?: string;
    correlation_id?: string;
    enqueued_at: string;
  };
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  generatedDocumentId?: string;
  numberReservationId?: string;
  /** Phase 5B — carried from the generate request to stamp the document at completion. */
  validUntil?: string;
}

export interface GeneratedDocumentEntity {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersionId: string;
  documentType: string;
  name: string;
  sourceEntityType: string;
  sourceEntityId: string;
  fileId: string;
  pdfFileId?: string;
  status: GeneratedDocumentStatus;
  documentNumber?: string;
  documentDate?: string;
  isFinal: boolean;
  generatedBy?: string;
  generatedAt: string;
  /** Phase 5B — срок действия удостоверения (YYYY-MM-DD); undefined = бессрочно. */
  validUntil?: string;
  archivedAt?: string;
  /** §5.7 — id документа-приказа, по которому выпущено это удостоверение (для трассировки каскада). */
  groupOrderDocumentId?: string;
  /** §5.8 — публичный токен для QR-проверки подлинности. ≥22 chars base64url (~128 бит). */
  qrToken?: string;
  /** §5.9 — момент аннулирования (ISO timestamp). */
  revokedAt?: string;
  /** §5.9 — кто аннулировал. */
  revokedBy?: string;
  /** §5.9 — обязательная причина (валидируется на уровне сервиса). */
  revocationReason?: string;
  /** §5.9 — если этот документ — перевыпуск, ссылка на оригинал. */
  replacesDocumentId?: string;
  /** §5.9 — если этот документ был перевыпущен, ссылка на перевыпуск. */
  replacedByDocumentId?: string;
}

export interface NumberingRuleEntity {
  id: string;
  tenantId: string;
  documentType: string;
  prefix: string;
  suffix: string;
  pattern: string;
  currentCounter: number;
  resetPeriod: NumberResetPeriod;
  isActive: boolean;
  updatedAt: string;
  periodKey?: string;
}

export interface NumberReservationEntity {
  id: string;
  tenantId: string;
  ruleId: string;
  documentId?: string;
  reservedNumber: string;
  reservedAt: string;
  usedAt?: string;
  status: 'reserved' | 'used' | 'released' | 'failed';
}
