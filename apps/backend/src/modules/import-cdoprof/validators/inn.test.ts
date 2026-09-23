import { describe, expect, it } from 'vitest';

import { isValidInn } from './inn.js';

describe('isValidInn', () => {
  it('принимает ИНН с верной контрольной суммой (10 и 12 цифр)', () => {
    // Открытые примеры из документации ФНС по алгоритму контрольной суммы.
    expect(isValidInn('7707083893')).toBe(true);
    expect(isValidInn('500100732259')).toBe(true);
    expect(isValidInn(' 7707083893 ')).toBe(true);
  });

  it('отвергает неверную контрольную сумму, длину и не-цифры', () => {
    expect(isValidInn('7707083894')).toBe(false);
    expect(isValidInn('500100732258')).toBe(false);
    expect(isValidInn('770708389')).toBe(false);
    expect(isValidInn('')).toBe(false);
    expect(isValidInn('77070838AB')).toBe(false);
  });
});
