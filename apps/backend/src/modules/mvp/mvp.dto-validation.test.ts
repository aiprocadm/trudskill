import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  CreateAssignmentSubmissionRequest,
  CreateBulkEnrollmentsRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  UpdateMaterialProgressRequest
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
