import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { RostechnadzorRow, RostechnadzorRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;
const INN_RE = /^(\d{10}|\d{12})$/;

/**
 * Provisional preflight for Ростехнадзор rows. Hard fields (ФИО, протокол, область,
 * дата) exclude a row; optional СНИЛС/ИНН are format-validated only when present.
 * Missing optionals produce blank cells, not errors.
 */
export function validateRostechnadzorRow(row: RostechnadzorRow): RostechnadzorRowError[] {
  const errs: RostechnadzorRowError[] = [];
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
  if (!row.protocolNumber?.trim()) push('protocolNumber', 'Номер протокола отсутствует');
  if (!row.attestationArea?.trim()) push('attestationArea', 'Область аттестации отсутствует');
  if (!DATE_RE.test(row.knowledgeCheckDate ?? ''))
    push('knowledgeCheckDate', 'Дата проверки знаний должна быть в формате ДД.ММ.ГГГГ');

  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  return errs;
}
