import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateRostechnadzorExportDto } from './rostechnadzor-registry-export.dto.js';

describe('CreateRostechnadzorExportDto', () => {
  it('accepts an empty body (all optional)', () => {
    expect(validateSync(plainToInstance(CreateRostechnadzorExportDto, {}))).toHaveLength(0);
  });

  it('accepts full filter', () => {
    const dto = plainToInstance(CreateRostechnadzorExportDto, {
      groupId: 'g1',
      clientId: 'c1',
      enrolledFrom: '2026-01-01',
      enrolledTo: '2026-12-31'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects non-string groupId', () => {
    expect(
      validateSync(plainToInstance(CreateRostechnadzorExportDto, { groupId: 5 }))
    ).not.toHaveLength(0);
  });
});
