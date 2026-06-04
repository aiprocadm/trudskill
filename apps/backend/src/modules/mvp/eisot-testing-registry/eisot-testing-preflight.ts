import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { EisotTestingRow, EisotTestingRowError } from '../mvp.types.js';

const INN_RE = /^(\d{10}|\d{12})$/;

/**
 * Provisional preflight for ЕИСОТ «лица на тестирование» rows. Hard fields (ФИО,
 * работодатель) exclude a row; optional СНИЛС/ИНН are format-validated only when
 * present. Missing optionals (СНИЛС / ИНН / дата рождения / должность / программа)
 * produce blank cells, not errors — see plan «Known deviations» #4.
 */
export function validateEisotTestingRow(row: EisotTestingRow): EisotTestingRowError[] {
  const errs: EisotTestingRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      enrollmentId: row.enrollmentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.employerName?.trim()) push('employerName', 'Наименование работодателя отсутствует');

  // СНИЛС опционален; но если указан — должен быть валиден (ловим опечатки ввода).
  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  // ИНН опционален; но если указан — 10 или 12 цифр.
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  return errs;
}
