/**
 * Контрольная сумма ИНН (ФНС): 10 цифр — организация, 12 — физлицо/ИП.
 *
 * В Фазе 0 нужна сторожу фикстур («ИНН в репозитории заведомо ничьи» — у каждого неверная
 * контрольная сумма); в Фазе 4 — валидатору импорта (МГ-K3.1: «валидаторы (СНИЛС, ИНН, даты)»).
 */
const WEIGHTS_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_12_A = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_12_B = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

const checkDigit = (digits: number[], weights: number[]): number => {
  const sum = weights.reduce((acc, weight, index) => acc + weight * (digits[index] ?? 0), 0);
  return (sum % 11) % 10;
};

export const isValidInn = (value: string): boolean => {
  const inn = value.trim();
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const digits = [...inn].map((d) => Number(d));
  if (digits.length === 10) {
    return checkDigit(digits, WEIGHTS_10) === digits[9];
  }
  return (
    checkDigit(digits, WEIGHTS_12_A) === digits[10] &&
    checkDigit(digits, WEIGHTS_12_B) === digits[11]
  );
};
