import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { BulkImportLearnersRequest } from './learners-bulk-import.dto.js';
import {
  AddCommissionMemberRequest,
  CreateAssignmentSubmissionRequest,
  CreateBulkEnrollmentsRequest,
  CreateCommissionRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  PutCourseDocumentSetRequest,
  UpdateMaterialProgressRequest,
  UpdateProgramMetaRequest
} from './mvp.dto.js';

describe('MVP critical DTO (class-validator)', () => {
  it('отклоняет отрицательный studiedSeconds', () => {
    const inst = plainToInstance(UpdateMaterialProgressRequest, {
      enrollmentId: 'enr_x',
      studiedSeconds: -1
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('отклоняет отсутствие learnerId в CreateAssignmentSubmissionRequest', () => {
    const inst = plainToInstance(CreateAssignmentSubmissionRequest, {
      assignmentId: 'a1',
      enrollmentId: 'e1'
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('отклоняет пустой enrollmentId в UpdateMaterialProgressRequest', () => {
    const inst = plainToInstance(UpdateMaterialProgressRequest, {
      enrollmentId: '',
      studiedSeconds: 0
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('принимает массовое назначение по organizationUnitId без явного learnerIds', () => {
    const inst = plainToInstance(CreateBulkEnrollmentsRequest, {
      idempotencyKey: 'k',
      groupId: 'g1',
      organizationUnitId: 'hr_1'
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('отклоняет не-строковый enrollmentId в UpdateMaterialProgressRequest', () => {
    const inst = plainToInstance(UpdateMaterialProgressRequest, {
      enrollmentId: 999,
      studiedSeconds: 1
    } as unknown as UpdateMaterialProgressRequest);
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('отклоняет CreateModuleRequest с отрицательным minViewSeconds', () => {
    const inst = plainToInstance(CreateModuleRequest, {
      courseVersionId: 'cv_1',
      title: 'Module',
      minViewSeconds: -10
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('отклоняет CreateMaterialRequest с неизвестным materialType', () => {
    const inst = plainToInstance(CreateMaterialRequest, {
      moduleId: 'm_1',
      title: 'Material',
      materialType: 'zip'
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('принимает валидный CreateMaterialRequest', () => {
    const inst = plainToInstance(CreateMaterialRequest, {
      moduleId: 'm_2',
      title: 'Video material',
      materialType: 'video',
      minViewSeconds: 120,
      isRequired: true
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
});

describe('Pillar A — CreateCommissionRequest', () => {
  it('отклоняет пустой code', () => {
    const inst = plainToInstance(CreateCommissionRequest, { code: '', name: 'ok' });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'code')?.constraints).toMatchObject({
      isNotEmpty: expect.any(String)
    });
  });

  it('отклоняет code длиннее 100', () => {
    const inst = plainToInstance(CreateCommissionRequest, {
      code: 'x'.repeat(101),
      name: 'ok'
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'code')?.constraints).toMatchObject({
      maxLength: expect.any(String)
    });
  });

  it('принимает минимально валидное тело', () => {
    const inst = plainToInstance(CreateCommissionRequest, {
      code: 'OT_2026',
      name: 'Аттестационная комиссия ОТ'
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
});

describe('Pillar A — AddCommissionMemberRequest', () => {
  it('отклоняет неизвестный role', () => {
    const inst = plainToInstance(AddCommissionMemberRequest, {
      role: 'unknown',
      userId: 'u1',
      positionInOrder: 0
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'role')?.constraints).toMatchObject({
      isIn: expect.any(String)
    });
  });

  it('принимает внешнего эксперта без userId', () => {
    const inst = plainToInstance(AddCommissionMemberRequest, {
      role: 'external_expert',
      externalFullName: 'Иванов И.И.',
      externalPosition: 'Эксперт Ростехнадзора',
      positionInOrder: 0
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('принимает internal user без externalFullName', () => {
    const inst = plainToInstance(AddCommissionMemberRequest, {
      role: 'chairman',
      userId: 'u_chairman',
      positionInOrder: 0
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('отклоняет positionInOrder < 0', () => {
    const inst = plainToInstance(AddCommissionMemberRequest, {
      role: 'member',
      userId: 'u_1',
      positionInOrder: -1
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'positionInOrder')?.constraints).toMatchObject({
      min: expect.any(String)
    });
  });
});

describe('Pillar A — UpdateProgramMetaRequest', () => {
  it('отклоняет academicHours = 0', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, { academicHours: 0 });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'academicHours')?.constraints).toMatchObject({
      min: expect.any(String)
    });
  });

  it('отклоняет неизвестный trainingType', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, { trainingType: 'unknown' });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'trainingType')?.constraints).toMatchObject({
      isIn: expect.any(String)
    });
  });

  it('отклоняет regulatoryBasisCodes длиннее 20 элементов', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, {
      regulatoryBasisCodes: Array(21).fill('CODE')
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'regulatoryBasisCodes')?.constraints).toMatchObject({
      arrayMaxSize: expect.any(String)
    });
  });

  it('принимает полностью валидную мету', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, {
      academicHours: 40,
      trainingType: 'primary',
      learnerCategory: 'worker',
      studyForm: 'distance',
      finalAssessmentForm: 'test',
      regulatoryBasisCodes: ['PP_2464_2022', 'PRIKAZ_26N_2024'],
      commissionId: 'cm_1'
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('принимает пустое тело (все поля optional на patch)', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, {});
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
});

describe('Pillar A — PutCourseDocumentSetRequest', () => {
  it('отклоняет entry с пустым templateId', () => {
    const inst = plainToInstance(PutCourseDocumentSetRequest, {
      entries: [{ templateId: '', position: 0, isRequired: true, autoIssueOnCompletion: true }]
    });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('отклоняет entries длиной > 20', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      templateId: `tpl_${i}`,
      position: i,
      isRequired: true,
      autoIssueOnCompletion: true
    }));
    const inst = plainToInstance(PutCourseDocumentSetRequest, { entries: tooMany });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.find((e) => e.property === 'entries')?.constraints).toMatchObject({
      arrayMaxSize: expect.any(String)
    });
  });

  it('принимает валидный массив entries', () => {
    const inst = plainToInstance(PutCourseDocumentSetRequest, {
      entries: [
        { templateId: 'tpl_1', position: 0, isRequired: true, autoIssueOnCompletion: true },
        { templateId: 'tpl_2', position: 1, isRequired: false, autoIssueOnCompletion: false }
      ]
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('принимает пустой массив entries (очистить пакет)', () => {
    const inst = plainToInstance(PutCourseDocumentSetRequest, { entries: [] });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  // === Phase 2 Plan A — BulkImportLearnersRequest ===

  it('BulkImportLearnersRequest: принимает 3 валидные строки', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'idem_1',
      groupId: 'grp_1',
      rows: [
        { rowNumber: 2, fullName: 'Иванов Иван Иванович', email: 'a@b.ru' },
        { rowNumber: 3, fullName: 'Петрова Анна', email: 'c@d.ru', snils: '111-222-333 44' },
        { rowNumber: 4, fullName: 'Сидоров', email: 'e@f.ru', position: 'Главный специалист' }
      ]
    });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('BulkImportLearnersRequest: отклоняет пустой rows', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: 'g',
      rows: []
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет rows > 1000', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      rowNumber: i + 2,
      fullName: `Фамилия Имя${i}`,
      email: `u${i}@x.ru`
    }));
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: 'g',
      rows
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет пустой idempotencyKey', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: '',
      groupId: 'g',
      rows: [{ rowNumber: 2, fullName: 'X Y', email: 'a@b.ru' }]
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет пустой groupId', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: '',
      rows: [{ rowNumber: 2, fullName: 'X Y', email: 'a@b.ru' }]
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет row без fullName', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: 'g',
      rows: [{ rowNumber: 2, fullName: '', email: 'a@b.ru' }]
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет row без email', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: 'g',
      rows: [{ rowNumber: 2, fullName: 'X Y', email: '' }]
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });

  it('BulkImportLearnersRequest: отклоняет rowNumber < 1', () => {
    const inst = plainToInstance(BulkImportLearnersRequest, {
      idempotencyKey: 'k',
      groupId: 'g',
      rows: [{ rowNumber: 0, fullName: 'X Y', email: 'a@b.ru' }]
    });
    expect(validateSync(inst).length).toBeGreaterThan(0);
  });
});
