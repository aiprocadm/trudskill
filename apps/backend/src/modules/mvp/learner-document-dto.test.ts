import { describe, expect, it } from 'vitest';

import { mapDocumentToLearnerDto } from './mvp.service.js';

import type { GeneratedDocumentEntity } from '../documents/documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'doc_1',
    tenantId: 't1',
    documentType: 'certificate',
    name: 'Удостоверение №1',
    status: 'final',
    isFinal: true,
    fileId: '',
    ...overrides
  } as GeneratedDocumentEntity;
}

describe('mapDocumentToLearnerDto — signature passthrough (Phase 6)', () => {
  it('passes signatureStatus through when set on the entity', () => {
    const dto = mapDocumentToLearnerDto(
      makeDoc({ signatureStatus: 'signed' }),
      '/api/v1',
      'enr_1',
      'Охрана труда',
      'course_1'
    );
    expect(dto.signatureStatus).toBe('signed');
  });

  it('leaves signatureStatus undefined for an unsigned document', () => {
    const dto = mapDocumentToLearnerDto(makeDoc(), '/api/v1', 'enr_1', 'Охрана труда');
    expect(dto.signatureStatus).toBeUndefined();
  });
});
