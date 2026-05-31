import { describe, expect, it } from 'vitest';

import { type EnrollmentBundle, buildRegistryRows } from './ot-registry-rows.js';

const bundle: EnrollmentBundle = {
  enrollment: { id: 'enr_1', learnerId: 'lrn_1', status: 'completed' } as any,
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    position: 'Слесарь'
  } as any,
  employerInn: '7707083893',
  protocol: { documentNumber: 'ПР-12/2026', documentDate: '2026-03-10' } as any,
  examPassed: true,
  programs: [
    { code: 'OT_A', registryId: 1, exactName: 'Программа А ...', programKind: 'A', isActive: true },
    {
      code: 'OT_FIRST_AID',
      registryId: 4,
      exactName: 'Первая помощь ...',
      programKind: 'first_aid',
      isActive: true
    }
  ]
};

describe('buildRegistryRows', () => {
  it('fans out one row per program for a комплексный курс', () => {
    const rows = buildRegistryRows([bundle]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.programRegistryId)).toEqual([1, 4]);
    expect(rows[0].fullName).toBe('Иванов Иван Иванович');
    expect(rows[0].knowledgeCheckDate).toBe('10.03.2026');
    expect(rows[0].result).toBe('удовлетворительно');
  });
  it('marks неудовлетворительно when exam not passed', () => {
    const rows = buildRegistryRows([{ ...bundle, examPassed: false }]);
    expect(rows[0].result).toBe('неудовлетворительно');
  });
});
