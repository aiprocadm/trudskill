import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AddTestQuestionRequest, ReorderTestQuestionRequest } from './add-test-question.dto.js';
import { CreateCounterpartyExtendedRequest } from './create-counterparty-extended.dto.js';
import { BulkImportLearnersRequest } from './learners-bulk-import.dto.js';
import {
  AddCommissionMemberRequest,
  CreateAssignmentSubmissionRequest,
  CreateBulkEnrollmentsRequest,
  CreateCommissionRequest,
  CreateGroupCourseRequest,
  CreateIdentityVerificationRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateProctoringChunkUploadUrlRequest,
  PutCourseDocumentSetRequest,
  RequestPreExamTokenRequest,
  ReviewIdentityVerificationRequest,
  SetProctoringOverrideRequest,
  StartProctoringRecordingRequest,
  SubmitIdentityVerificationRequest,
  UpdateMaterialProgressRequest,
  UpdateProgramMetaRequest,
  VerifyPreExamTokenRequest
} from './mvp.dto.js';
import {
  CreateAssignmentRequest as Phase3CreateAssignmentRequest,
  CreateQuestionBankRequest as Phase3CreateQuestionBankRequest,
  CreateQuestionRequest as Phase3CreateQuestionRequest,
  CreateTestRequest as Phase3CreateTestRequest,
  UpdateAssignmentRequest as Phase3UpdateAssignmentRequest,
  UpdateQuestionBankRequest as Phase3UpdateQuestionBankRequest,
  UpdateQuestionRequest as Phase3UpdateQuestionRequest,
  UpdateTestRequest as Phase3UpdateTestRequest
} from './mvp.dto.js';
import { UpdateCounterpartyExtendedRequest } from './update-counterparty-extended.dto.js';
import { UpdateLearnerExtendedRequest } from './update-learner-extended.dto.js';
import { UpdateTestRuleRequest } from './update-test-rule.dto.js';

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

  it('отклоняет recertificationPeriodMonths = 0', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, { recertificationPeriodMonths: 0 });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(
      errs.find((e) => e.property === 'recertificationPeriodMonths')?.constraints
    ).toMatchObject({
      min: expect.any(String)
    });
  });

  it('принимает recertificationPeriodMonths = 12', () => {
    const inst = plainToInstance(UpdateProgramMetaRequest, { recertificationPeriodMonths: 12 });
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

describe('UpdateLearnerExtendedRequest', () => {
  const validate = (raw: unknown) => {
    const instance = plainToInstance(UpdateLearnerExtendedRequest, raw);
    return validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts empty payload (no-op patch)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts full happy path', () => {
    expect(
      validate({
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: 'Петрович',
        email: 'ivan@example.com',
        snils: '123-456-789 01',
        position: 'инженер',
        organizationUnitId: 'unit-1',
        learnerNo: '0000123',
        status: 'active',
        linkedIamUserId: 'user-abc'
      })
    ).toHaveLength(0);
  });

  it('rejects invalid email', () => {
    const errors = validate({ email: 'not-an-email' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('email');
  });

  it('accepts null for clearable strings', () => {
    expect(
      validate({
        middleName: null,
        email: null,
        snils: null,
        position: null,
        organizationUnitId: null,
        learnerNo: null,
        linkedIamUserId: null
      })
    ).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const errors = validate({ status: 'banned' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('status');
  });

  it('rejects empty firstName (MinLength)', () => {
    const errors = validate({ firstName: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('firstName');
  });

  it('rejects oversized field', () => {
    const errors = validate({ firstName: 'x'.repeat(121) });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('firstName');
  });
});

describe('CreateCounterpartyExtendedRequest (Phase 2 Plan C)', () => {
  const validate = (raw: unknown) => {
    const instance = plainToInstance(CreateCounterpartyExtendedRequest, raw);
    return validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts minimal happy path (code + name only)', () => {
    expect(validate({ code: 'OOO-IVANOV', name: 'ООО Иванов' })).toHaveLength(0);
  });

  it('accepts full happy path with all extended fields', () => {
    expect(
      validate({
        code: 'OOO-IVANOV',
        name: 'ООО Иванов',
        legalName: 'Общество с ограниченной ответственностью «Иванов»',
        inn: '7707083893',
        kpp: '770701001',
        contactEmail: 'hr@ivanov.ru',
        contactPhone: '+7 (495) 123-45-67',
        legalAddress: 'Москва, ул. Тверская, 1',
        note: 'Постоянный клиент с 2024 года.'
      })
    ).toHaveLength(0);
  });

  it('accepts 12-digit ИНН (ИП)', () => {
    expect(validate({ code: 'IP-1', name: 'ИП Иванов', inn: '770708389365' })).toHaveLength(0);
  });

  it('rejects 11-digit ИНН (invalid length)', () => {
    const errors = validate({ code: 'X', name: 'X', inn: '12345678901' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('inn');
  });

  it('rejects non-digit ИНН', () => {
    const errors = validate({ code: 'X', name: 'X', inn: '770A083893' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('inn');
  });

  it('rejects КПП wrong length', () => {
    const errors = validate({ code: 'X', name: 'X', kpp: '12345678' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('kpp');
  });

  it('rejects invalid email', () => {
    const errors = validate({ code: 'X', name: 'X', contactEmail: 'not-an-email' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('contactEmail');
  });

  it('rejects empty code', () => {
    const errors = validate({ code: '', name: 'X' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('code');
  });

  it('rejects oversized note', () => {
    const errors = validate({ code: 'X', name: 'X', note: 'x'.repeat(2001) });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('note');
  });
});

describe('UpdateCounterpartyExtendedRequest (Phase 2 Plan C)', () => {
  const validate = (raw: unknown) => {
    const instance = plainToInstance(UpdateCounterpartyExtendedRequest, raw);
    return validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts empty payload (no-op patch)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts null for clearable fields', () => {
    expect(
      validate({
        legalName: null,
        inn: null,
        kpp: null,
        contactEmail: null,
        contactPhone: null,
        legalAddress: null,
        note: null
      })
    ).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const errors = validate({ status: 'banned' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('status');
  });

  it('accepts both archived and active status', () => {
    expect(validate({ status: 'archived' })).toHaveLength(0);
    expect(validate({ status: 'active' })).toHaveLength(0);
  });

  it('rejects invalid ИНН format on patch', () => {
    const errors = validate({ inn: '123' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('inn');
  });
});

// ---------- Phase 3 Plan A: assessment admin DTOs (existing in mvp.dto.ts + new files) ----------

function validateDto<T extends object>(
  Cls: new () => T,
  raw: object
): ReturnType<typeof validateSync> {
  return validateSync(plainToInstance(Cls, raw), { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateQuestionBankRequest (Phase 3 Plan A — existing mvp.dto.ts)', () => {
  it('accepts a minimal valid bank', () => {
    expect(validateDto(Phase3CreateQuestionBankRequest, { title: 'Bank A' })).toHaveLength(0);
  });

  it('accepts bank with optional description + courseId + code', () => {
    expect(
      validateDto(Phase3CreateQuestionBankRequest, {
        title: 'B',
        description: 'd',
        courseId: 'c1',
        code: 'OT-1'
      })
    ).toHaveLength(0);
  });

  it('rejects missing title', () => {
    expect(validateDto(Phase3CreateQuestionBankRequest, {} as object).length).toBeGreaterThan(0);
  });

  it('rejects empty title', () => {
    expect(validateDto(Phase3CreateQuestionBankRequest, { title: '' }).length).toBeGreaterThan(0);
  });
});

describe('UpdateQuestionBankRequest (PATCH)', () => {
  it('accepts empty patch', () => {
    expect(validateDto(Phase3UpdateQuestionBankRequest, {})).toHaveLength(0);
  });

  it('accepts partial title update', () => {
    expect(validateDto(Phase3UpdateQuestionBankRequest, { title: 'new' })).toHaveLength(0);
  });
});

describe('CreateQuestionRequest (Phase 3 — 5 types + numeric/expectedAnswer/tags)', () => {
  const baseSingle = {
    questionBankId: 'qb1',
    title: 'Q?',
    type: 'single_choice' as const,
    score: 1,
    answerOptions: [
      { text: 'a', isCorrect: true },
      { text: 'b', isCorrect: false }
    ]
  };

  it('accepts a valid single_choice question', () => {
    expect(validateDto(Phase3CreateQuestionRequest, baseSingle)).toHaveLength(0);
  });

  it('accepts multiple_choice question with two correct options', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'multiple_choice',
        score: 2,
        answerOptions: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: true },
          { text: 'c', isCorrect: false }
        ]
      })
    ).toHaveLength(0);
  });

  it('accepts valid number_input with numericExpected (new Plan A type)', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        title: '2+2?',
        type: 'number_input',
        score: 1,
        numericExpected: 4,
        numericTolerance: 0.1
      })
    ).toHaveLength(0);
  });

  it('rejects number_input with negative tolerance', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'number_input',
        score: 1,
        numericExpected: 4,
        numericTolerance: -1
      }).length
    ).toBeGreaterThan(0);
  });

  it('accepts text question with optional expectedAnswer (new field)', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'text',
        score: 1,
        expectedAnswer: 'Paris'
      })
    ).toHaveLength(0);
  });

  it('accepts essay question with no extra fields (new Plan A type)', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'essay',
        score: 5
      })
    ).toHaveLength(0);
  });

  it('accepts tags array (new Plan A field)', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'essay',
        score: 1,
        tags: ['safety', 'ОТ-2024']
      })
    ).toHaveLength(0);
  });

  it('rejects invalid type literal (e.g. boolean — legacy SQL type but removed from runtime DTO)', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, {
        questionBankId: 'qb1',
        type: 'boolean',
        score: 1
      } as object).length
    ).toBeGreaterThan(0);
  });

  it('rejects missing questionBankId', () => {
    expect(
      validateDto(Phase3CreateQuestionRequest, { type: 'text', score: 1 } as object).length
    ).toBeGreaterThan(0);
  });
});

describe('UpdateQuestionRequest (PATCH — Phase 3 new fields)', () => {
  it('accepts empty patch', () => {
    expect(validateDto(Phase3UpdateQuestionRequest, {})).toHaveLength(0);
  });

  it('accepts numeric tolerance update (new Plan A field)', () => {
    expect(
      validateDto(Phase3UpdateQuestionRequest, { numericExpected: 5, numericTolerance: 0 })
    ).toHaveLength(0);
  });

  it('accepts type change to essay (new Plan A type)', () => {
    expect(validateDto(Phase3UpdateQuestionRequest, { type: 'essay' })).toHaveLength(0);
  });

  it('rejects negative tolerance on update', () => {
    expect(
      validateDto(Phase3UpdateQuestionRequest, { numericTolerance: -1 }).length
    ).toBeGreaterThan(0);
  });

  it('rejects bad type literal', () => {
    expect(
      validateDto(Phase3UpdateQuestionRequest, { type: 'unknown' } as object).length
    ).toBeGreaterThan(0);
  });

  it('accepts tags update', () => {
    expect(validateDto(Phase3UpdateQuestionRequest, { tags: ['a'] })).toHaveLength(0);
  });
});

describe('CreateTestRequest (existing — Plan A unchanged)', () => {
  it('accepts a minimal test', () => {
    expect(validateDto(Phase3CreateTestRequest, { courseId: 'c1', title: 'T' })).toHaveLength(0);
  });

  it('rejects missing courseId', () => {
    expect(validateDto(Phase3CreateTestRequest, { title: 'T' } as object).length).toBeGreaterThan(
      0
    );
  });

  it('rejects missing title', () => {
    expect(
      validateDto(Phase3CreateTestRequest, { courseId: 'c1' } as object).length
    ).toBeGreaterThan(0);
  });
});

describe('UpdateTestRequest (PATCH)', () => {
  it('accepts empty patch', () => {
    expect(validateDto(Phase3UpdateTestRequest, {})).toHaveLength(0);
  });

  it('rejects empty title', () => {
    expect(validateDto(Phase3UpdateTestRequest, { title: '' }).length).toBeGreaterThan(0);
  });
});

describe('UpdateTestRuleRequest (Phase 3 Plan A new DTO)', () => {
  it('accepts empty patch', () => {
    expect(validateDto(UpdateTestRuleRequest, {})).toHaveLength(0);
  });

  it('accepts a fully-specified rule', () => {
    expect(
      validateDto(UpdateTestRuleRequest, {
        attemptLimit: 3,
        randomizeQuestions: true,
        questionCount: 10,
        timeLimitMinutes: 30,
        passingScore: 0.8,
        dailyResetEnabled: false
      })
    ).toHaveLength(0);
  });

  it('rejects attemptLimit = 0', () => {
    expect(validateDto(UpdateTestRuleRequest, { attemptLimit: 0 }).length).toBeGreaterThan(0);
  });

  it('rejects negative passingScore', () => {
    expect(validateDto(UpdateTestRuleRequest, { passingScore: -1 }).length).toBeGreaterThan(0);
  });

  it('rejects questionCount = 0', () => {
    expect(validateDto(UpdateTestRuleRequest, { questionCount: 0 }).length).toBeGreaterThan(0);
  });
});

describe('AddTestQuestionRequest / ReorderTestQuestionRequest (Phase 3 Plan A new DTOs)', () => {
  it('accepts add with required questionId', () => {
    expect(validateDto(AddTestQuestionRequest, { questionId: 'q1' })).toHaveLength(0);
  });

  it('accepts add with sortOrder', () => {
    expect(validateDto(AddTestQuestionRequest, { questionId: 'q1', sortOrder: 3 })).toHaveLength(0);
  });

  it('rejects add without questionId', () => {
    expect(validateDto(AddTestQuestionRequest, {} as object).length).toBeGreaterThan(0);
  });

  it('rejects negative sortOrder', () => {
    expect(
      validateDto(AddTestQuestionRequest, { questionId: 'q1', sortOrder: -1 }).length
    ).toBeGreaterThan(0);
  });

  it('reorder requires sortOrder', () => {
    expect(validateDto(ReorderTestQuestionRequest, {} as object).length).toBeGreaterThan(0);
  });

  it('reorder accepts valid sortOrder', () => {
    expect(validateDto(ReorderTestQuestionRequest, { sortOrder: 2 })).toHaveLength(0);
  });
});

describe('CreateAssignmentRequest (existing)', () => {
  it('accepts a minimal assignment', () => {
    expect(
      validateDto(Phase3CreateAssignmentRequest, { courseId: 'c1', title: 'A', maxScore: 100 })
    ).toHaveLength(0);
  });

  it('rejects missing courseId', () => {
    expect(
      validateDto(Phase3CreateAssignmentRequest, { title: 'A', maxScore: 0 } as object).length
    ).toBeGreaterThan(0);
  });
});

describe('UpdateAssignmentRequest (PATCH)', () => {
  it('accepts empty patch', () => {
    expect(validateDto(Phase3UpdateAssignmentRequest, {})).toHaveLength(0);
  });

  it('rejects empty title', () => {
    expect(validateDto(Phase3UpdateAssignmentRequest, { title: '' }).length).toBeGreaterThan(0);
  });
});

describe('CreateTestRequest — moduleId (Wave 1)', () => {
  it('accepts an optional moduleId string', () => {
    const dto = plainToInstance(Phase3CreateTestRequest, {
      courseId: 'c1',
      title: 'Module 1 test',
      moduleId: 'mod_1'
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.moduleId).toBe('mod_1');
  });

  it('accepts an omitted moduleId (course-level / final exam)', () => {
    const dto = plainToInstance(Phase3CreateTestRequest, { courseId: 'c1', title: 'Final' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.moduleId).toBeUndefined();
  });

  it('rejects an empty-string moduleId', () => {
    const dto = plainToInstance(Phase3CreateTestRequest, {
      courseId: 'c1',
      title: 'X',
      moduleId: ''
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('Pre-exam auth DTOs', () => {
  it('RequestPreExamTokenRequest accepts a full attempt context', () => {
    const dto = plainToInstance(RequestPreExamTokenRequest, {
      testId: 't1',
      enrollmentId: 'e1',
      learnerId: 'l1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('RequestPreExamTokenRequest rejects a missing testId', () => {
    const dto = plainToInstance(RequestPreExamTokenRequest, {
      enrollmentId: 'e1',
      learnerId: 'l1'
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('VerifyPreExamTokenRequest accepts a non-empty token', () => {
    const dto = plainToInstance(VerifyPreExamTokenRequest, { token: 'abc' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('VerifyPreExamTokenRequest rejects an empty token', () => {
    const dto = plainToInstance(VerifyPreExamTokenRequest, { token: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresPreExamAuth', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresPreExamAuth: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresPreExamAuth).toBe(true);
  });
});

describe('Identity verification DTOs (Phase 4 Plan A)', () => {
  it('CreateIdentityVerificationRequest accepts an empty body (actor-linked learner)', () => {
    const dto = plainToInstance(CreateIdentityVerificationRequest, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('CreateIdentityVerificationRequest rejects an empty learnerId string', () => {
    const dto = plainToInstance(CreateIdentityVerificationRequest, { learnerId: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('SubmitIdentityVerificationRequest requires both file ids and consent === true', () => {
    const ok = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      passportFileId: 'f2',
      consent: true
    });
    expect(validateSync(ok)).toHaveLength(0);
    const noConsent = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      passportFileId: 'f2',
      consent: false
    });
    expect(validateSync(noConsent).length).toBeGreaterThan(0);
    const missingFile = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      consent: true
    });
    expect(validateSync(missingFile).length).toBeGreaterThan(0);
  });

  it('ReviewIdentityVerificationRequest accepts approve/reject and rejects other decisions', () => {
    const ok = plainToInstance(ReviewIdentityVerificationRequest, {
      decision: 'reject',
      rejectionReason: 'blurry'
    });
    expect(validateSync(ok)).toHaveLength(0);
    const bad = plainToInstance(ReviewIdentityVerificationRequest, { decision: 'maybe' });
    expect(validateSync(bad).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresIdentityVerification', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresIdentityVerification: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresIdentityVerification).toBe(true);
  });
});

describe('Proctoring DTOs (Phase 4 Plan B)', () => {
  it('StartProctoringRecordingRequest requires enrollmentId, courseId and consent === true', () => {
    const ok = plainToInstance(StartProctoringRecordingRequest, {
      enrollmentId: 'enr_1',
      courseId: 'c_1',
      consent: true
    });
    expect(validateSync(ok)).toHaveLength(0);

    const noConsent = plainToInstance(StartProctoringRecordingRequest, {
      enrollmentId: 'enr_1',
      courseId: 'c_1',
      consent: false
    });
    expect(validateSync(noConsent).length).toBeGreaterThan(0);

    const missingEnrollment = plainToInstance(StartProctoringRecordingRequest, {
      courseId: 'c_1',
      consent: true
    });
    expect(validateSync(missingEnrollment).length).toBeGreaterThan(0);
  });

  it('CreateProctoringChunkUploadUrlRequest validates sequence ≥ 0 and the upload triple', () => {
    const ok = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 0,
      originalName: 'chunk-0.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(ok)).toHaveLength(0);

    const negative = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: -1,
      originalName: 'chunk.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(negative).length).toBeGreaterThan(0);

    const fractional = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 1.5,
      originalName: 'chunk.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(fractional).length).toBeGreaterThan(0);

    const noMime = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 0,
      originalName: 'chunk.webm',
      sizeBytes: 1024
    });
    expect(validateSync(noMime).length).toBeGreaterThan(0);
  });

  it("SetProctoringOverrideRequest accepts 'require' | 'exempt' | null and rejects others", () => {
    for (const override of ['require', 'exempt', null]) {
      const dto = plainToInstance(SetProctoringOverrideRequest, { override });
      expect(validateSync(dto), `override=${String(override)} must be valid`).toHaveLength(0);
    }
    const bad = plainToInstance(SetProctoringOverrideRequest, { override: 'maybe' });
    expect(validateSync(bad).length).toBeGreaterThan(0);
    const missing = plainToInstance(SetProctoringOverrideRequest, {});
    expect(validateSync(missing).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresProctoring', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresProctoring: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresProctoring).toBe(true);
  });
});
