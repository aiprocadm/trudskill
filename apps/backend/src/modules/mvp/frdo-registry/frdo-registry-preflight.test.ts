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

  it('ФТ-C4.1: пустой СНИЛС — теперь ОШИБКА, а не пустая ячейка в файле', () => {
    // Раньше запись уходила в реестр без СНИЛС, и человек в ней не опознавался.
    const errs = validateFrdoRow({ ...valid, snils: '' });
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });

  /*
   * Вопрос №12 «Арендной СДО», решение 08.09.2026: дата рождения ОБЯЗАТЕЛЬНА для выгрузки
   * (но не для заведения слушателя). В реестре по ней различают однофамильцев; пустая ячейка
   * означала, что запись подадут и она вернётся отказом через недели.
   *
   * Прежде здесь стоял обратный тест «дата рождения пока НЕ блокирует» — он фиксировал
   * временное положение до решения владельца.
   */
  it('вопрос №12: пустая дата рождения — ОШИБКА, а не пустая ячейка в файле', () => {
    const errs = validateFrdoRow({ ...valid, dateOfBirth: '' });
    expect(errs.some((e) => e.field === 'dateOfBirth')).toBe(true);
  });

  it('дата рождения в чужом формате тоже не проходит', () => {
    /* Строка формируется из хранимого значения: мусор в базе дал бы «1990-05-01». */
    const errs = validateFrdoRow({ ...valid, dateOfBirth: '1990-05-01' });
    expect(errs.some((e) => e.field === 'dateOfBirth')).toBe(true);
  });

  it('отказ называет человека — по отчёту видно, кого дозаполнить', () => {
    const errs = validateFrdoRow({ ...valid, dateOfBirth: '' });
    expect(errs[0]?.fullName).toBe('Иванов Иван Иванович');
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
