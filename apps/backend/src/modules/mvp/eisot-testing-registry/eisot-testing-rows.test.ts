import { describe, expect, it } from 'vitest';

import { buildEisotTestingRows } from './eisot-testing-rows.js';

import type { EisotTestingBundle } from './eisot-testing-rows.js';

const bundle: EisotTestingBundle = {
  enrollment: {
    id: 'enr_1',
    learnerId: 'lrn_1',
    enrolledAt: '2026-03-10'
  } as EisotTestingBundle['enrollment'],
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01',
    position: 'Электрик'
  } as EisotTestingBundle['learner'],
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда (40 ч)'
};

describe('buildEisotTestingRows', () => {
  it('maps one enrollment to one learner row with formatted dates', () => {
    const [row] = buildEisotTestingRows([bundle]);
    expect(row!.enrollmentId).toBe('enr_1');
    expect(row!.learnerId).toBe('lrn_1');
    expect(row!.lastName).toBe('Иванов');
    expect(row!.fullName).toBe('Иванов Иван Иванович');
    expect(row!.snils).toBe('112-233-445 95');
    expect(row!.dateOfBirth).toBe('01.05.1990');
    expect(row!.position).toBe('Электрик');
    expect(row!.employerName).toBe('ООО Ромашка');
    expect(row!.employerInn).toBe('7707083893');
    expect(row!.programName).toBe('Охрана труда (40 ч)');
    expect(row!.referralDate).toBe('10.03.2026');
  });

  it('emits empty strings for missing optional fields', () => {
    const [row] = buildEisotTestingRows([
      {
        ...bundle,
        employerInn: '',
        learner: {
          ...bundle.learner,
          snils: undefined,
          dateOfBirth: undefined,
          position: undefined
        } as EisotTestingBundle['learner']
      }
    ]);
    expect(row!.snils).toBe('');
    expect(row!.dateOfBirth).toBe('');
    expect(row!.position).toBe('');
    expect(row!.employerInn).toBe('');
  });
});
