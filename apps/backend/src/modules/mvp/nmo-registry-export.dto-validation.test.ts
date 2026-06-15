import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateNmoExportDto } from './nmo-registry-export.dto.js';

describe('CreateNmoExportDto', () => {
  it('accepts empty body', () => {
    expect(validateSync(plainToInstance(CreateNmoExportDto, {}))).toHaveLength(0);
  });

  it('accepts full filter with valid types', () => {
    const dto = plainToInstance(CreateNmoExportDto, {
      from: '2026-01-01',
      to: '2026-12-31',
      types: ['certificate'],
      groupId: 'g1',
      clientId: 'c1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an unknown document type', () => {
    expect(
      validateSync(plainToInstance(CreateNmoExportDto, { types: ['passport'] }))
    ).not.toHaveLength(0);
  });
});
