import { describe, expect, it } from 'vitest';

import { validateRegistryRow } from './ot-registry-preflight.js';

import type { OtRegistryRow } from '../mvp.types.js';

const valid: OtRegistryRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Обучение по общим вопросам охраны труда...',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('validateRegistryRow', () => {
  it('passes a fully valid row', () => {
    expect(validateRegistryRow(valid)).toEqual([]);
  });
  it('rejects bad СНИЛС checksum', () => {
    const errs = validateRegistryRow({ ...valid, snils: '112-233-445 00' });
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });
  it('rejects ИНН of wrong length', () => {
    const errs = validateRegistryRow({ ...valid, employerInn: '123' });
    expect(errs.some((e) => e.field === 'employerInn')).toBe(true);
  });
  it('requires position, protocolNumber, date', () => {
    const errs = validateRegistryRow({
      ...valid,
      position: '',
      protocolNumber: '',
      knowledgeCheckDate: ''
    });
    expect(errs.map((e) => e.field).sort()).toEqual([
      'knowledgeCheckDate',
      'position',
      'protocolNumber'
    ]);
  });
});
