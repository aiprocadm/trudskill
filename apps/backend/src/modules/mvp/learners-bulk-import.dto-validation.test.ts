import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { BulkImportLearnersRequest } from './learners-bulk-import.dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';

/**
 * Регрессия: `assertValidDto` валидирует с `forbidNonWhitelisted: true`. Поле `dateOfBirth`
 * читается сервисом и типом `BulkImportRow`, но раньше отсутствовало в `BulkImportRowDto` —
 * любой запрос с dateOfBirth отвергался целиком (нарушение partial-success на уровне HTTP).
 */
function makeRequest(rowOverrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'idem-1',
    groupId: 'grp-1',
    rows: [
      {
        rowNumber: 2,
        fullName: 'Иванов Иван Иванович',
        email: 'ivan@example.com',
        ...rowOverrides
      }
    ]
  };
}

describe('BulkImportLearnersRequest DTO', () => {
  it('accepts a row carrying dateOfBirth (ФИС ФРДО export field)', () => {
    const dto = assertValidDto(
      BulkImportLearnersRequest,
      makeRequest({ dateOfBirth: '1990-05-21' })
    );
    expect(dto.rows[0]?.dateOfBirth).toBe('1990-05-21');
  });

  it('accepts a row with all optional fields present', () => {
    const dto = assertValidDto(
      BulkImportLearnersRequest,
      makeRequest({ snils: '112-233-445 95', position: 'Инженер', dateOfBirth: '1985-12-01' })
    );
    expect(dto.rows[0]?.position).toBe('Инженер');
    expect(dto.rows[0]?.dateOfBirth).toBe('1985-12-01');
  });

  it('still rejects genuinely unknown fields (forbidNonWhitelisted)', () => {
    expect(() =>
      assertValidDto(BulkImportLearnersRequest, makeRequest({ bogusField: 'x' }))
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate rowNumber values (would collapse outcome rows)', () => {
    const request = {
      idempotencyKey: 'idem-1',
      groupId: 'grp-1',
      rows: [
        { rowNumber: 2, fullName: 'Иванов Иван', email: 'a@example.com' },
        { rowNumber: 2, fullName: 'Петров Пётр', email: 'b@example.com' }
      ]
    };
    expect(() => assertValidDto(BulkImportLearnersRequest, request)).toThrow(BadRequestException);
  });

  it('accepts distinct rowNumbers', () => {
    const request = {
      idempotencyKey: 'idem-1',
      groupId: 'grp-1',
      rows: [
        { rowNumber: 2, fullName: 'Иванов Иван', email: 'a@example.com' },
        { rowNumber: 3, fullName: 'Петров Пётр', email: 'b@example.com' }
      ]
    };
    const dto = assertValidDto(BulkImportLearnersRequest, request);
    expect(dto.rows).toHaveLength(2);
  });
});
