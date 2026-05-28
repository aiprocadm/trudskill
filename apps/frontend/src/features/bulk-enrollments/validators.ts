import type { ClassifiedParsedRow, ParsedRow, RowError } from './types';

/**
 * Phase 2 Plan A — frontend-зеркало backend `classifyRows`.
 *
 * Дублирование преднамеренное: даёт мгновенный preview-UX перед отправкой
 * (backend всё равно source-of-truth и переклассифицирует). Reuse-резолюция
 * НЕ делается на фронте — там нет snapshot существующих учёток.
 *
 * При drift между frontend/backend — реальное решение принимает backend.
 * Если потребуется ≥3 правки в обоих местах — вынести в packages/shared-types.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIO_PART_RE = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;

export function normalizeSnils(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidSnilsChecksum(digits: string): boolean {
  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (9 - i);
  }
  let computed: number;
  if (sum < 100) {
    computed = sum;
  } else if (sum === 100 || sum === 101) {
    computed = 0;
  } else {
    const mod = sum % 101;
    computed = mod === 100 || mod === 101 ? 0 : mod;
  }
  return computed === Number(digits.slice(9, 11));
}

export function classifyParsedRows(rows: ParsedRow[]): ClassifiedParsedRow[] {
  // Pre-pass: in-file дубликаты
  const emailCounts = new Map<string, number>();
  const snilsCounts = new Map<string, number>();
  for (const row of rows) {
    const email = row.email?.toLowerCase().trim() ?? '';
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    if (row.snils) {
      const snils = normalizeSnils(row.snils);
      if (snils.length === 11) snilsCounts.set(snils, (snilsCounts.get(snils) ?? 0) + 1);
    }
  }

  const result: ClassifiedParsedRow[] = [];
  for (const row of rows) {
    const errors: RowError[] = [];

    // ФИО
    const fullName = (row.fullName ?? '').trim();
    const parts = fullName.length > 0 ? fullName.split(/\s+/) : [];
    if (parts.length < 2 || parts.length > 4) {
      errors.push({
        field: 'fullName',
        code: 'invalid_format',
        message: 'ФИО должно состоять из 2-4 слов'
      });
    } else if (!parts.every((p) => FIO_PART_RE.test(p))) {
      errors.push({
        field: 'fullName',
        code: 'invalid_format',
        message: 'ФИО должно быть кириллицей с заглавных букв'
      });
    }

    // email
    const emailLower = (row.email ?? '').toLowerCase().trim();
    if (!EMAIL_RE.test(emailLower)) {
      errors.push({
        field: 'email',
        code: 'invalid_format',
        message: 'Некорректный email'
      });
    }

    // snils
    let snilsNormalized: string | null = null;
    if (row.snils && row.snils.trim().length > 0) {
      snilsNormalized = normalizeSnils(row.snils);
      if (snilsNormalized.length !== 11 || !isValidSnilsChecksum(snilsNormalized)) {
        errors.push({
          field: 'snils',
          code: 'invalid_format',
          message: 'Некорректный СНИЛС (формат или контрольная сумма)'
        });
        snilsNormalized = null;
      }
    }

    // in-file дубликаты
    if (emailLower && (emailCounts.get(emailLower) ?? 0) > 1) {
      errors.push({
        field: 'email',
        code: 'duplicate_in_file',
        message: 'Email повторяется в файле'
      });
    }
    if (snilsNormalized && (snilsCounts.get(snilsNormalized) ?? 0) > 1) {
      errors.push({
        field: 'snils',
        code: 'duplicate_in_file',
        message: 'СНИЛС повторяется в файле'
      });
    }

    result.push({
      row,
      classification: errors.length > 0 ? 'invalid' : 'valid',
      errors
    });
  }

  return result;
}
