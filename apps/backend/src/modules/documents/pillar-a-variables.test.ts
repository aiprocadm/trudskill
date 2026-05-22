import { describe, expect, it } from 'vitest';

import {
  FINAL_ASSESSMENT_FORM_LABELS,
  LEARNER_CATEGORY_LABELS,
  STUDY_FORM_LABELS,
  TRAINING_TYPE_LABELS,
  resolveCommissionVariables,
  resolveProgramVariables
} from './pillar-a-variables.js';

import type {
  Commission,
  CommissionMember,
  CourseVersion,
  RegulatoryAct
} from '../mvp/mvp.types.js';

const baseCourseVersion: CourseVersion = {
  id: 'cv_1',
  tenantId: 't_1',
  courseId: 'c_1',
  versionNo: 1,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

const fullProgramMeta: CourseVersion = {
  ...baseCourseVersion,
  academicHours: 40,
  trainingType: 'primary',
  learnerCategory: 'worker',
  studyForm: 'distance',
  finalAssessmentForm: 'test',
  regulatoryBasisCodes: ['PP_2464_2022', 'PRIKAZ_26N_2024'],
  commissionId: 'cm_1'
};

const acts: RegulatoryAct[] = [
  {
    code: 'PP_2464_2022',
    shortName: 'ПП 2464',
    fullName: 'Постановление Правительства РФ от 24.12.2022 №2464',
    issuingAuthority: 'Правительство РФ',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    code: 'PRIKAZ_26N_2024',
    shortName: 'Приказ Минтруда 26н',
    fullName: 'Приказ Минтруда РФ от 17.01.2024 №26н',
    issuingAuthority: 'Минтруд России',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z'
  }
];

const commission: Commission = {
  id: 'cm_1',
  tenantId: 't_1',
  code: 'OT_2026',
  name: 'Аттестационная комиссия ОТ 2026',
  description: 'Состав 2026 года',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

describe('resolveProgramVariables', () => {
  it('resolves academic_hours as number', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.academic_hours'
    ]);
    expect(r).toEqual({ 'program.academic_hours': 40 });
  });

  it('resolves training_type code and Russian label', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.training_type',
      'program.training_type_label'
    ]);
    expect(r['program.training_type']).toBe('primary');
    expect(r['program.training_type_label']).toBe(TRAINING_TYPE_LABELS.primary);
    expect(r['program.training_type_label']).toBe('Первичное обучение');
  });

  it('resolves all enum labels for filled meta', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.learner_category_label',
      'program.study_form_label',
      'program.final_assessment_form_label'
    ]);
    expect(r['program.learner_category_label']).toBe(LEARNER_CATEGORY_LABELS.worker);
    expect(r['program.study_form_label']).toBe(STUDY_FORM_LABELS.distance);
    expect(r['program.final_assessment_form_label']).toBe(FINAL_ASSESSMENT_FORM_LABELS.test);
  });

  it('joins regulatory_basis as CSV of short names in declared order', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.regulatory_basis'
    ]);
    expect(r['program.regulatory_basis']).toBe('ПП 2464, Приказ Минтруда 26н');
  });

  it('skips regulatory codes that are not in the acts catalog', () => {
    const r = resolveProgramVariables(
      {
        courseVersion: {
          ...fullProgramMeta,
          regulatoryBasisCodes: ['PP_2464_2022', 'UNKNOWN_CODE', 'PRIKAZ_26N_2024']
        },
        regulatoryActs: acts
      },
      ['program.regulatory_basis']
    );
    expect(r['program.regulatory_basis']).toBe('ПП 2464, Приказ Минтруда 26н');
  });

  it('reads commission_name/code when commission passed in context', () => {
    const r = resolveProgramVariables(
      { courseVersion: fullProgramMeta, regulatoryActs: acts, commission },
      ['program.commission_name', 'program.commission_code']
    );
    expect(r['program.commission_name']).toBe('Аттестационная комиссия ОТ 2026');
    expect(r['program.commission_code']).toBe('OT_2026');
  });

  it('returns empty string for commission_name when no commission attached', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.commission_name'
    ]);
    expect(r['program.commission_name']).toBe('');
  });

  it('returns empty string for unknown program variable', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'program.nonexistent_field'
    ]);
    expect(r['program.nonexistent_field']).toBe('');
  });

  it('returns empty for variables outside program.* namespace', () => {
    const r = resolveProgramVariables({ courseVersion: fullProgramMeta, regulatoryActs: acts }, [
      'commission.code',
      'learner.name'
    ]);
    expect(r['commission.code']).toBe('');
    expect(r['learner.name']).toBe('');
  });

  it('returns empty for fields not set on draft course version (no meta)', () => {
    const r = resolveProgramVariables({ courseVersion: baseCourseVersion, regulatoryActs: acts }, [
      'program.academic_hours',
      'program.training_type',
      'program.training_type_label',
      'program.regulatory_basis'
    ]);
    expect(r['program.academic_hours']).toBe('');
    expect(r['program.training_type']).toBe('');
    expect(r['program.training_type_label']).toBe('');
    expect(r['program.regulatory_basis']).toBe('');
  });
});

describe('resolveCommissionVariables', () => {
  const chairman: CommissionMember = {
    id: 'm_1',
    tenantId: 't_1',
    commissionId: 'cm_1',
    role: 'chairman',
    externalFullName: 'Иванов И.И.',
    externalPosition: 'Главный инженер по ОТ',
    signatureFileId: 'file_sig_1',
    positionInOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };
  const secretary: CommissionMember = {
    id: 'm_2',
    tenantId: 't_1',
    commissionId: 'cm_1',
    role: 'secretary',
    externalFullName: 'Сидорова А.А.',
    externalPosition: 'Секретарь комиссии',
    signatureFileId: 'file_sig_2',
    positionInOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };
  const member: CommissionMember = {
    id: 'm_3',
    tenantId: 't_1',
    commissionId: 'cm_1',
    role: 'member',
    externalFullName: 'Петров П.П.',
    externalPosition: 'Эксперт',
    positionInOrder: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  it('resolves code, name, description', () => {
    const r = resolveCommissionVariables({ commission, members: [chairman, secretary, member] }, [
      'commission.code',
      'commission.name',
      'commission.description'
    ]);
    expect(r).toEqual({
      'commission.code': 'OT_2026',
      'commission.name': 'Аттестационная комиссия ОТ 2026',
      'commission.description': 'Состав 2026 года'
    });
  });

  it('resolves chairman name/position/signature', () => {
    const r = resolveCommissionVariables({ commission, members: [chairman, secretary] }, [
      'commission.chairman.name',
      'commission.chairman.position',
      'commission.chairman.signature_file_id'
    ]);
    expect(r['commission.chairman.name']).toBe('Иванов И.И.');
    expect(r['commission.chairman.position']).toBe('Главный инженер по ОТ');
    expect(r['commission.chairman.signature_file_id']).toBe('file_sig_1');
  });

  it('resolves secretary fields', () => {
    const r = resolveCommissionVariables({ commission, members: [chairman, secretary] }, [
      'commission.secretary.name',
      'commission.secretary.position'
    ]);
    expect(r['commission.secretary.name']).toBe('Сидорова А.А.');
    expect(r['commission.secretary.position']).toBe('Секретарь комиссии');
  });

  it('returns empty when role is absent (no chairman in members)', () => {
    const r = resolveCommissionVariables({ commission, members: [secretary, member] }, [
      'commission.chairman.name',
      'commission.chairman.signature_file_id'
    ]);
    expect(r['commission.chairman.name']).toBe('');
    expect(r['commission.chairman.signature_file_id']).toBe('');
  });

  it('returns members as JSON-serializable array sorted by positionInOrder', () => {
    // intentionally reversed input order to verify sorting
    const r = resolveCommissionVariables({ commission, members: [member, secretary, chairman] }, [
      'commission.members'
    ]);
    const list = r['commission.members'] as Array<{
      fullName: string;
      role: string;
      position: string;
      positionInOrder: number;
    }>;
    expect(list).toHaveLength(3);
    expect(list[0].fullName).toBe('Иванов И.И.');
    expect(list[0].role).toBe('chairman');
    expect(list[1].fullName).toBe('Сидорова А.А.');
    expect(list[2].fullName).toBe('Петров П.П.');
  });

  it('returns empty string for unknown commission variable', () => {
    const r = resolveCommissionVariables({ commission, members: [chairman] }, [
      'commission.totally_unknown_field'
    ]);
    expect(r['commission.totally_unknown_field']).toBe('');
  });

  it('returns empty string for variables outside commission.* namespace', () => {
    const r = resolveCommissionVariables({ commission, members: [chairman] }, [
      'program.academic_hours'
    ]);
    expect(r['program.academic_hours']).toBe('');
  });

  it('handles internal user member with no external_full_name (returns empty string)', () => {
    const internalChairman: CommissionMember = {
      id: 'm_int',
      tenantId: 't_1',
      commissionId: 'cm_1',
      role: 'chairman',
      userId: 'u_iam_chair',
      positionInOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    const r = resolveCommissionVariables({ commission, members: [internalChairman] }, [
      'commission.chairman.name',
      'commission.chairman.position'
    ]);
    expect(r['commission.chairman.name']).toBe('');
    expect(r['commission.chairman.position']).toBe('');
  });
});

describe("DocumentsService.variableCategories includes 'program'", () => {
  // Документация-проверка: тест ниже находится не здесь, а в documents.service.test —
  // но мы напрямую проверяем экспорт констант, которые гарантируют отсутствие drift.
  it('TRAINING_TYPE_LABELS covers all enum values', () => {
    const allKeys: Array<keyof typeof TRAINING_TYPE_LABELS> = [
      'primary',
      'repeat',
      'target',
      'extraordinary'
    ];
    for (const k of allKeys) {
      expect(TRAINING_TYPE_LABELS[k]).toBeTruthy();
    }
  });

  it('LEARNER_CATEGORY_LABELS covers all enum values', () => {
    const allKeys: Array<keyof typeof LEARNER_CATEGORY_LABELS> = [
      'worker',
      'specialist',
      'manager',
      'mixed'
    ];
    for (const k of allKeys) {
      expect(LEARNER_CATEGORY_LABELS[k]).toBeTruthy();
    }
  });
});
