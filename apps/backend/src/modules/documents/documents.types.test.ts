import { describe, expect, it } from 'vitest';

import type {
  DocumentSignatureStatus,
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

describe('GeneratedDocumentEntity signature fields (Phase 6)', () => {
  it('accepts a fully-signed document shape', () => {
    const statuses: DocumentSignatureStatus[] = ['unsigned', 'signed', 'failed'];
    expect(statuses).toContain('signed');
    const doc: Pick<
      GeneratedDocumentEntity,
      | 'signatureStatus'
      | 'signedAt'
      | 'signedBy'
      | 'signatureProvider'
      | 'signatureRef'
      | 'signatureCertificateSubject'
    > = {
      signatureStatus: 'signed',
      signedAt: '2026-06-15T00:00:00.000Z',
      signedBy: 'user_1',
      signatureProvider: 'cryptopro',
      signatureRef: 'sig_abc',
      signatureCertificateSubject: 'CN=ООО Учебный Центр'
    };
    expect(doc.signatureStatus).toBe('signed');
  });
});
