import { describe, expect, it } from 'vitest';

import type {
  GeneratedDocumentEntity,
  TemplateType,
  VariableCategoryCode
} from './documents.types.js';

describe('Pillar A Plan B types', () => {
  it('TemplateType enumerates 8 values (7 regulated + contract grandfathered)', () => {
    const all: TemplateType[] = [
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report',
      'contract'
    ];
    expect(all).toHaveLength(8);
  });

  it('VariableCategoryCode enumerates 10 known categories', () => {
    const all: VariableCategoryCode[] = [
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
    ];
    expect(all).toHaveLength(10);
  });

  it('GeneratedDocumentEntity accepts optional groupOrderDocumentId', () => {
    const sample: GeneratedDocumentEntity = {
      id: 'gdoc_1',
      tenantId: 't1',
      templateId: 'tpl_1',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      fileId: 'f_1',
      status: 'generated',
      documentNumber: 'N-1',
      documentDate: '2026-05-24',
      isFinal: false,
      generatedAt: '2026-05-24T00:00:00.000Z',
      groupOrderDocumentId: 'gdoc_order_1'
    };
    expect(sample.groupOrderDocumentId).toBe('gdoc_order_1');
  });

  it('GeneratedDocumentEntity allows omitting groupOrderDocumentId', () => {
    const sample: GeneratedDocumentEntity = {
      id: 'gdoc_2',
      tenantId: 't1',
      templateId: 'tpl_1',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc 2',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_2',
      fileId: 'f_2',
      status: 'generated',
      isFinal: false,
      generatedAt: '2026-05-24T00:00:00.000Z'
    };
    expect(sample.groupOrderDocumentId).toBeUndefined();
  });
});
