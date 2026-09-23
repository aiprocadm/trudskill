import { describe, expect, it } from 'vitest';

import { CreateAndRunBackfillDto, CreateBackfillRunDto } from './backfill.request-dto.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';

/**
 * Вход дозаполнения. Ручки закрыты общим секретом и работают поверх всех центров сразу,
 * но тело до ревизии 2026-08-26 не проверялось: домен мог быть любой строкой, а размер
 * пачки — нулём или миллионом.
 */

describe('запуск дозаполнения', () => {
  it('обычный запуск проходит', () => {
    expect(assertValidDto(CreateBackfillRunDto, { domain: 'lms' }).domain).toBe('lms');
  });

  it('домен Фазы 1 «снимок → таблицы» принимается', () => {
    expect(assertValidDto(CreateBackfillRunDto, { domain: 'lms_normalized' }).domain).toBe(
      'lms_normalized'
    );
  });

  it('выдуманный домен отклоняется', () => {
    expect(() => assertValidDto(CreateBackfillRunDto, { domain: 'всё подряд' })).toThrow();
  });

  it('нулевая пачка отклоняется — работы не будет', () => {
    expect(() => assertValidDto(CreateBackfillRunDto, { domain: 'lms', batchSize: 0 })).toThrow();
  });

  it('пачка в миллион отклоняется — так база занимается на часы одной командой', () => {
    expect(() =>
      assertValidDto(CreateBackfillRunDto, { domain: 'lms', batchSize: 1_000_000 })
    ).toThrow();
  });

  it('число проходов проверяется так же', () => {
    expect(() =>
      assertValidDto(CreateAndRunBackfillDto, { domain: 'documents', maxBatches: 0 })
    ).toThrow();
    expect(
      assertValidDto(CreateAndRunBackfillDto, { domain: 'documents', maxBatches: 5 }).maxBatches
    ).toBe(5);
  });
});
