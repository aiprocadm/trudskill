import { describe, expect, it } from 'vitest';

import { validateNmoRow } from './nmo-preflight.js';

import type { NmoRow } from '../mvp.types.js';

const row = (over: Partial<NmoRow> = {}): NmoRow => ({
  documentId: 'd1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Петрова',
  firstName: 'Анна',
  middleName: 'Сергеевна',
  fullName: 'Петрова Анна Сергеевна',
  snils: '112-233-445 95',
  specialty: '',
  programName: 'Кардиология',
  creditUnits: '36',
  completionDate: '20.04.2026',
  documentNumber: 'НМО-7',
  ...over
});

describe('validateNmoRow', () => {
  it('accepts a valid row (specialty/ЗЕТ optional)', () => {
    expect(validateNmoRow(row())).toEqual([]);
  });

  it('flags missing ФИО, номер документа, программа, bad date', () => {
    const fields = validateNmoRow(
      row({ lastName: '', fullName: '', documentNumber: '', programName: '', completionDate: 'x' })
    ).map((e) => e.field);
    expect(fields).toContain('fullName');
    expect(fields).toContain('documentNumber');
    expect(fields).toContain('programName');
    expect(fields).toContain('completionDate');
  });

  it('flags non-numeric ЗЕТ only when present', () => {
    expect(validateNmoRow(row({ creditUnits: '' }))).toEqual([]);
    expect(validateNmoRow(row({ creditUnits: 'abc' })).map((e) => e.field)).toContain(
      'creditUnits'
    );
  });

  it('validates СНИЛС checksum only when present', () => {
    expect(validateNmoRow(row({ snils: '' }))).toEqual([]);
    expect(validateNmoRow(row({ snils: '123-456-789 00' })).map((e) => e.field)).toContain('snils');
  });
});
