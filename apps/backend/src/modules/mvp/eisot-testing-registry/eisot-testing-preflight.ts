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
  // ФТ-C4.1 (Фаза 3 Task 8): СНИЛС обязателен. Раньше пустой СНИЛС давал пустую ячейку —
  // файл уходил в реестр, а человек в нём фактически не опознавался. Отсутствие поля
  // должно быть видно ДО отправки, а не приходить ошибкой реестра через недели.
  if (!row.snils?.trim()) {
    push('snils', 'СНИЛС не заполнен — без него запись в реестре не принимается');
  } else {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils))
      push('snils', 'СНИЛС не проходит проверку контрольной суммы — вероятна опечатка');
  }
  // ИНН опционален; но если указан — 10 или 12 цифр.
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  return errs;
}
