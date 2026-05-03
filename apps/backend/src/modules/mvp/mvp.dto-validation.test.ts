import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateAssignmentSubmissionRequest, UpdateMaterialProgressRequest } from './mvp.dto.js';

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

  it('отклоняет не-строковый enrollmentId в UpdateMaterialProgressRequest', () => {
    const inst = plainToInstance(UpdateMaterialProgressRequest, {
      enrollmentId: 999,
      studiedSeconds: 1
    } as unknown as UpdateMaterialProgressRequest);
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.length).toBeGreaterThan(0);
  });
});
