import { describe, expect, it } from 'vitest';

import { validateFrdoRow } from './frdo-registry-preflight.js';

import type { FrdoRegistryRow } from '../mvp.types.js';

const valid: FrdoRegistryRow = {
  documentId: 'doc_1',
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  documentKindCode: 'PK',
  documentKind: 'Удостоверение о повышении квалификации',
  registrationNumber: 'УД-000123',
  issueDate: '10.03.2026',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  programName: 'Охрана труда',
  academicHours: '40',
  qualification: ''
};

describe('validateFrdoRow', () => {
  it('accepts a complete row', () => {
    expect(validateFrdoRow(valid)).toHaveLength(0);
  });

  it('accepts a row with no СНИЛС and no birth date (optional)', () => {
    expect(validateFrdoRow({ ...valid, snils: '', dateOfBirth: '' })).toHaveLength(0);
  });

  it('rejects missing number / bad date / missing name / kind / program, and a malformed СНИЛС', () => {
    expect(
      validateFrdoRow({ ...valid, registrationNumber: '' }).some(
        (e) => e.field === 'registrationNumber'
      )
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, issueDate: '2026-03-10' }).some((e) => e.field === 'issueDate')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, lastName: '', firstName: '' }).some((e) => e.field === 'fullName')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, documentKindCode: '' }).some((e) => e.field === 'documentKind')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, programName: '' }).some((e) => e.field === 'programName')
    ).toBe(true);
    expect(validateFrdoRow({ ...valid, snils: '123' }).some((e) => e.field === 'snils')).toBe(true);
  });
});
