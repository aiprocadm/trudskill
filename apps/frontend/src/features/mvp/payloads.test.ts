import { describe, expect, it } from 'vitest';

import { buildCommissionInfoPayload, buildProgramMetaPatch } from './payloads';

const filled = {
  academicHours: '40',
  trainingType: 'primary' as const,
  learnerCategory: 'worker' as const,
  studyForm: 'distance' as const,
  finalAssessmentForm: 'test' as const,
  regulatoryBasisCodes: ['PP_2464_2022'],
  commissionId: 'commission_1',
  otProgramCodes: ['OT-1']
};

describe('buildProgramMetaPatch (clear-vs-keep)', () => {
  it('sends real values when fields are filled', () => {
    const patch = buildProgramMetaPatch(filled);
    expect(patch.academicHours).toBe(40);
    expect(patch.trainingType).toBe('primary');
    expect(patch.commissionId).toBe('commission_1');
    expect(patch.regulatoryBasisCodes).toEqual(['PP_2464_2022']);
    expect(patch.otProgramCodes).toEqual(['OT-1']);
  });

  it('emits explicit clearing values for emptied fields (null / [])', () => {
    const patch = buildProgramMetaPatch({
      academicHours: '',
      trainingType: '',
      learnerCategory: '',
      studyForm: '',
      finalAssessmentForm: '',
      regulatoryBasisCodes: [],
      commissionId: '',
      otProgramCodes: []
    });
    expect(patch.academicHours).toBeNull();
    expect(patch.trainingType).toBeNull();
    expect(patch.learnerCategory).toBeNull();
    expect(patch.studyForm).toBeNull();
    expect(patch.finalAssessmentForm).toBeNull();
    expect(patch.commissionId).toBeNull();
    expect(patch.regulatoryBasisCodes).toEqual([]);
    expect(patch.otProgramCodes).toEqual([]);
  });

  it('treats zero / non-positive hours as a clear (null), not 0', () => {
    expect(buildProgramMetaPatch({ ...filled, academicHours: '0' }).academicHours).toBeNull();
  });
});

describe('buildCommissionInfoPayload (clear-vs-keep)', () => {
  it('always includes description; whitespace-only clears it to empty string', () => {
    expect(buildCommissionInfoPayload('Имя', '  ')).toEqual({ name: 'Имя', description: '' });
  });

  it('trims and passes through a real description', () => {
    expect(buildCommissionInfoPayload('  Имя  ', '  desc  ')).toEqual({
      name: 'Имя',
      description: 'desc'
    });
  });
});
