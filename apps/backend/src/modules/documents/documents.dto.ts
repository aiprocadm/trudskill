import type { TemplateType, VariableCategoryCode } from './documents.types.js';

export interface BaseFilter {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  templateId?: string;
  templateVersionId?: string;
  documentType?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
}

export interface CreateTemplateRequest {
  name: string;
  templateType: TemplateType;
  description?: string;
}
export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
}

export interface CreateTemplateVersionRequest {
  templateId: string;
  fileId: string;
  variablesSchema?: Record<string, unknown>;
}
export interface UpdateTemplateVersionRequest {
  isActive?: boolean;
  variablesSchema?: Record<string, unknown>;
}

export interface CreateTemplateVariableRequest {
  templateVersionId: string;
  variableCode: string;
  displayName: string;
  categoryCode: VariableCategoryCode;
  dataType: string;
  isRequired?: boolean;
  description?: string;
}
export interface UpdateTemplateVariableRequest {
  displayName?: string;
  categoryCode?: VariableCategoryCode;
  dataType?: string;
  isRequired?: boolean;
  description?: string;
}

export interface CreateTemplateBindingRequest {
  templateId: string;
  bindType: 'direction' | 'course' | 'group';
  directionId?: string;
  courseId?: string;
  groupId?: string;
  attachMode?: string;
  inheritToChildren?: boolean;
  priority?: number;
}
export interface UpdateTemplateBindingRequest {
  attachMode?: string;
  inheritToChildren?: boolean;
  priority?: number;
}

export interface GenerateDocumentRequest {
  idempotencyKey: string;
  templateId: string;
  templateVersionId?: string;
  sourceEntityType: string;
  sourceEntityId: string;
  documentType: string;
}

export interface GenerateDocumentsBatchRequest {
  templateId: string;
  templateVersionId?: string;
  sourceEntityType: string;
  sourceEntityIds: string[];
  documentType: string;
}

export interface CreateNumberingRuleRequest {
  documentType: string;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  resetPeriod?: 'none' | 'year' | 'month';
}
export interface UpdateNumberingRuleRequest {
  prefix?: string;
  suffix?: string;
  pattern?: string;
  resetPeriod?: 'none' | 'year' | 'month';
}

/**
 * Pillar A Plan B §5.4 — список template_type, разрешённых DTO-валидацией.
 * Зафиксирован CHECK-constraint'ом `templates_type_chk` в migration 0032.
 * `as const satisfies readonly TemplateType[]` гарантирует compile-time sync
 * с union-типом (см. [[project-pillar-a-regulated-training]] Plan A pattern).
 */
export const ALLOWED_TEMPLATE_TYPES = [
  'certificate',
  'protocol',
  'order',
  'diploma',
  'attestation',
  'reference',
  'report',
  'contract'
] as const satisfies readonly TemplateType[];

/**
 * Pillar A Plan B §5.5 — список category_code, разрешённых DTO-валидацией.
 * Зафиксирован CHECK-constraint'ом `template_variables_category_chk` в migration 0032.
 */
export const ALLOWED_VARIABLE_CATEGORY_CODES = [
  'tenant',
  'group',
  'learner',
  'counterparty',
  'course',
  'commission',
  'document',
  'program',
  'enrollment',
  'group_learners'
] as const satisfies readonly VariableCategoryCode[];

export function assertTemplateType(value: unknown): asserts value is TemplateType {
  if (typeof value !== 'string' || !(ALLOWED_TEMPLATE_TYPES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid template_type "${String(value)}". Allowed: ${ALLOWED_TEMPLATE_TYPES.join(', ')}`
    );
  }
}

export function assertVariableCategoryCode(value: unknown): asserts value is VariableCategoryCode {
  if (
    typeof value !== 'string' ||
    !(ALLOWED_VARIABLE_CATEGORY_CODES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `Invalid category_code "${String(value)}". Allowed: ${ALLOWED_VARIABLE_CATEGORY_CODES.join(
        ', '
      )}`
    );
  }
}
