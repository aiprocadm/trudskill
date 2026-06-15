import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { NmoRow, NmoRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

/**
 * Provisional preflight for Минздрав-НМО rows. Hard fields (ФИО, номер документа,
 * программа, дата) exclude a row; optional СНИЛС / ЗЕТ are validated only when present.
 * Specialty is provisional and never required.
 */
export function validateNmoRow(row: NmoRow): NmoRowError[] {
  const errs: NmoRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      documentId: row.documentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.documentNumber?.trim()) push('documentNumber', 'Номер документа отсутствует');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');
  if (!DATE_RE.test(row.completionDate ?? ''))
    push('completionDate', 'Дата освоения должна быть в формате ДД.ММ.ГГГГ');

  if (row.creditUnits?.trim() && !/^\d+([.,]\d+)?$/.test(row.creditUnits.trim()))
    push('creditUnits', 'ЗЕТ должно быть числом');

  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  return errs;
}
