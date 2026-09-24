import type {
  DocumentGenerationTaskEntity,
  TemplateType,
  VariableCategoryCode
} from './documents.types.js';

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
  /** МГ-F1.1: вид документа, для которого предназначен шаблон. */
  kindCode?: string;
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
  /** Phase 5B — pre-computed expiry (YYYY-MM-DD) to stamp on the generated document. */
  validUntil?: string;
  /** ФТ-A5.3 — группа, ради закрытия которой заведена задача (см. `closeGroup`). */
  groupId?: string;
  /** МГ-F1.1: вид документа — ставится на выпущенный документ. */
  kindCode?: string;
}

/**
 * ФТ-A5.1 «закрыть группу»: одной операцией — протокол на группу и удостоверение
 * каждому сдавшему. Идемпотентна по (groupId, слушатель): повторный вызов ничего
 * не дублирует, а упавшие задачи возвращает в очередь (ФТ-A5.3).
 */
export interface CloseGroupRequest {
  groupId: string;
  protocolTemplateId: string;
  certificateTemplateId: string;
  /** Записи сдавших: по одному удостоверению на каждую. */
  enrollmentIds: string[];
}

export interface CloseGroupResult {
  protocol: DocumentGenerationTaskEntity;
  certificates: DocumentGenerationTaskEntity[];
  /** Сколько задач заведено этим вызовом (0 при повторе без новых слушателей). */
  created: number;
  /** Сколько упавших задач возвращено в очередь. */
  retried: number;
}

/** Сводка для админа: на чём стоит закрытие группы (ФТ-A5.3). */
export interface GroupClosureStatus {
  groupId: string;
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  /** Все задачи завершены успешно — группу можно выгружать. */
  isComplete: boolean;
}

export interface GenerateDocumentsBatchRequest {
  /** Pillar A hardening — caller-provided, чтобы retry того же batch не плодил tasks. */
  idempotencyKey: string;
  templateId: string;
  templateVersionId?: string;
  sourceEntityType: string;
  sourceEntityIds: string[];
  documentType: string;
}

export interface CreateNumberingRuleRequest {
  documentType: string;
  /** МГ-F3.1: правило вида документа; вид обязан относиться к `documentType`. */
  kindCode?: string;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  resetPeriod?: 'none' | 'year' | 'month';
  /** ФТ-A4.1: номер, с которого начнётся выдача (1 = обычный старт с единицы). */
  startCounter?: number;
}
export interface UpdateNumberingRuleRequest {
  prefix?: string;
  suffix?: string;
  pattern?: string;
  resetPeriod?: 'none' | 'year' | 'month';
  /**
   * ФТ-A4.1: сдвиг стартового номера (например, УЦ переносит нумерацию из бумажного
   * журнала и продолжает с 137). Только вперёд — откат назад повторно выдал бы уже
   * использованные номера.
   */
  startCounter?: number;
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
