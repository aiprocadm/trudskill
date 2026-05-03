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
  templateType: string;
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
  categoryCode: string;
  dataType: string;
  isRequired?: boolean;
  description?: string;
}
export interface UpdateTemplateVariableRequest {
  displayName?: string;
  categoryCode?: string;
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
