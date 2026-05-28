import { describe, expect, it } from 'vitest';

import { classifyParsedRows, isValidSnilsChecksum, normalizeSnils } from './validators';

import type { ParsedRow } from './types';

const row = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  rowNumber: 2,
  fullName: 'Иванов Иван Иванович',
  email: 'ivanov@example.ru',
  ...over
});

describe('frontend isValidSnilsChecksum (зеркало backend)', () => {
  it('valid sum < 100', () => {
    expect(isValidSnilsChecksum('11111111145')).toBe(true);
  });
  it('valid sum > 101 mod-result', () => {
    expect(isValidSnilsChecksum('11234567828')).toBe(true);
  });
  it('valid sum == 101 → checksum 00', () => {
    expect(isValidSnilsChecksum('45111110000')).toBe(true);
  });
  it('invalid checksum', () => {
    expect(isValidSnilsChecksum('11111111199')).toBe(false);
  });
  it('not 11 digits', () => {
    expect(isValidSnilsChecksum('123')).toBe(false);
  });
});

describe('normalizeSnils', () => {
  it('strips dashes and spaces', () => {
    expect(normalizeSnils('111-111-111 45')).toBe('11111111145');
  });
});

describe('classifyParsedRows', () => {
  it('3 валидных → 3 valid', () => {
    const result = classifyParsedRows([
      row({ rowNumber: 2, email: 'a@x.ru' }),
      row({ rowNumber: 3, fullName: 'Петрова Анна', email: 'b@x.ru' }),
      row({ rowNumber: 4, fullName: 'Сидоров Иван', email: 'c@x.ru' })
    ]);
    expect(result.every((r) => r.classification === 'valid')).toBe(true);
  });

  it('одно слово в ФИО → invalid', () => {
    const result = classifyParsedRows([row({ fullName: 'Иванов' })]);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'fullName')).toBe(true);
  });

  it('ФИО с цифрой → invalid', () => {
    const result = classifyParsedRows([row({ fullName: 'Иванов Иван1' })]);
    expect(result[0]!.classification).toBe('invalid');
  });

  it('некорректный email → invalid', () => {
    const result = classifyParsedRows([row({ email: 'no-at-sign' })]);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('невалидная СНИЛС-чексумма → invalid', () => {
    const result = classifyParsedRows([row({ snils: '111-111-111 99' })]);
    expect(result[0]!.classification).toBe('invalid');
  });

  it('валидный СНИЛС в формате с дефисами → valid', () => {
    const result = classifyParsedRows([row({ snils: '111-111-111 45' })]);
    expect(result[0]!.classification).toBe('valid');
  });

  it('валидный СНИЛС в формате только цифры → valid', () => {
    const result = classifyParsedRows([row({ snils: '11234567828' })]);
    expect(result[0]!.classification).toBe('valid');
  });

  it('дубликат email в файле → обе строки invalid', () => {
    const result = classifyParsedRows([
      row({ rowNumber: 2, email: 'same@x.ru' }),
      row({ rowNumber: 3, fullName: 'Петров Пётр', email: 'same@x.ru' })
    ]);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[1]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.code === 'duplicate_in_file')).toBe(true);
  });

  it('дубликат СНИЛС → обе invalid', () => {
    const result = classifyParsedRows([
      row({ rowNumber: 2, email: 'a@x.ru', snils: '111-111-111 45' }),
      row({ rowNumber: 3, fullName: 'Петров Пётр', email: 'b@x.ru', snils: '11111111145' })
    ]);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[1]!.classification).toBe('invalid');
  });

  it('пустой массив → пустой результат', () => {
    expect(classifyParsedRows([])).toEqual([]);
  });
});
