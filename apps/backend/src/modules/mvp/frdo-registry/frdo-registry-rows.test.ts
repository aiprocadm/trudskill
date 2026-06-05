import { describe, expect, it } from 'vitest';

import { buildFrdoRows } from './frdo-registry-rows.js';

import type { FrdoDocumentBundle } from './frdo-registry-rows.js';

const bundle: FrdoDocumentBundle = {
  document: {
    id: 'doc_1',
    documentNumber: 'УД-000123',
    documentDate: '2026-03-10',
    documentType: 'certificate'
  },
  enrollment: { id: 'enr_1', learnerId: 'lrn_1' } as FrdoDocumentBundle['enrollment'],
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01'
  } as FrdoDocumentBundle['learner'],
  kind: {
    code: 'PK',
    templateType: 'certificate',
    frdoKind: 'Удостоверение о повышении квалификации',
    educationLevel: 'ДПО',
    exactName: 'Удостоверение о повышении квалификации',
    isActive: true
  },
  programName: 'Охрана труда (40 ч)',
  academicHours: 40
};

describe('buildFrdoRows', () => {
  it('maps one issued document to one row with formatted dates', () => {
    const [row] = buildFrdoRows([bundle]);
    expect(row!.documentId).toBe('doc_1');
    expect(row!.registrationNumber).toBe('УД-000123');
    expect(row!.issueDate).toBe('10.03.2026');
    expect(row!.dateOfBirth).toBe('01.05.1990');
    expect(row!.lastName).toBe('Иванов');
    expect(row!.documentKindCode).toBe('PK');
    expect(row!.programName).toBe('Охрана труда (40 ч)');
    expect(row!.academicHours).toBe('40');
    expect(row!.fullName).toBe('Иванов Иван Иванович');
  });

  it('emits empty strings for missing optional fields', () => {
    const [row] = buildFrdoRows([
      {
        ...bundle,
        academicHours: undefined,
        learner: {
          ...bundle.learner,
          snils: undefined,
          dateOfBirth: undefined
        } as FrdoDocumentBundle['learner']
      }
    ]);
    expect(row!.snils).toBe('');
    expect(row!.dateOfBirth).toBe('');
    expect(row!.academicHours).toBe('');
  });
});
