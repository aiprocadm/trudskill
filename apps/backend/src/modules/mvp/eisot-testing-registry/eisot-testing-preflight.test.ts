import { describe, expect, it } from 'vitest';

import { validateEisotTestingRow } from './eisot-testing-preflight.js';

import type { EisotTestingRow } from '../mvp.types.js';

const valid: EisotTestingRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  position: 'Электрик',
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда',
  referralDate: '10.03.2026'
};

describe('validateEisotTestingRow', () => {
  it('accepts a complete row', () => {
    expect(validateEisotTestingRow(valid)).toHaveLength(0);
  });

  it('ФТ-C4.1: пустой СНИЛС — теперь ОШИБКА, а не пустая ячейка в файле', () => {
    const errs = validateEisotTestingRow({ ...valid, snils: '' });
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });

  it('битая контрольная сумма ловится и объясняется как опечатка', () => {
    const errs = validateEisotTestingRow({ ...valid, snils: '111-111-111 11' });
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });

  it('rejects missing ФИО and missing employer', () => {
    expect(
      validateEisotTestingRow({ ...valid, lastName: '', firstName: '' }).some(
        (e) => e.field === 'fullName'
      )
    ).toBe(true);
    expect(
      validateEisotTestingRow({ ...valid, employerName: '' }).some(
        (e) => e.field === 'employerName'
      )
    ).toBe(true);
  });

  it('rejects a malformed СНИЛС and a malformed ИНН when present', () => {
    expect(
      validateEisotTestingRow({ ...valid, snils: '123' }).some((e) => e.field === 'snils')
    ).toBe(true);
    expect(
      validateEisotTestingRow({ ...valid, employerInn: '12' }).some(
        (e) => e.field === 'employerInn'
      )
    ).toBe(true);
  });
});
