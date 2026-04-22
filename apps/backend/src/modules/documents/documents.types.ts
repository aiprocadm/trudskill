export type TemplateStatus = 'active' | 'archived';
export type TemplateBindingType = 'direction' | 'course' | 'group';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type GeneratedDocumentStatus = 'generated' | 'final' | 'archived';
export type NumberResetPeriod = 'none' | 'year' | 'month';

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
  archivedAt?: string;
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
