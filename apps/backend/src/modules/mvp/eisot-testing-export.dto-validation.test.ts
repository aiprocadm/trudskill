import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateEisotTestingExportDto } from './eisot-testing-export.dto.js';

describe('CreateEisotTestingExportDto', () => {
  it('accepts an empty object (all filters optional)', () => {
    expect(validateSync(plainToInstance(CreateEisotTestingExportDto, {}))).toHaveLength(0);
  });

  it('accepts valid optional string filters', () => {
    const dto = plainToInstance(CreateEisotTestingExportDto, {
      from: '2026-01-01',
      to: '2026-12-31',
      groupId: 'grp_1',
      clientId: 'cp_1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-string filter', () => {
    const errors = validateSync(plainToInstance(CreateEisotTestingExportDto, { from: 123 }));
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });
});
