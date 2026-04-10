import { Injectable } from '@nestjs/common';

import type {
  DocumentGenerationTaskEntity,
  GeneratedDocumentEntity,
  NumberReservationEntity,
  NumberingRuleEntity,
  TemplateBindingEntity,
  TemplateEntity,
  TemplateVariableEntity,
  TemplateVersionEntity
} from './documents.types.js';

@Injectable()
export class InMemoryDocumentsState {
  templates: TemplateEntity[] = [];
  versions: TemplateVersionEntity[] = [];
  variables: TemplateVariableEntity[] = [];
  bindings: TemplateBindingEntity[] = [];
  tasks: DocumentGenerationTaskEntity[] = [];
  generatedDocuments: GeneratedDocumentEntity[] = [];
  numberingRules: NumberingRuleEntity[] = [];
  reservations: NumberReservationEntity[] = [];
  idem = new Map<string, { taskId: string; expiresAt: number }>();
}
