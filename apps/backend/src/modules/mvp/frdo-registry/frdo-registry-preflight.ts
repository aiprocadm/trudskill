import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { FrdoRegistryRow, FrdoRegistryRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

/**
 * Provisional preflight for ФРДО rows. Hard fields exclude a row; optional СНИЛС is
 * checksum-validated only when present (catches typos). Missing optional fields
 * (СНИЛС / дата рождения / часы) produce blank cells, not errors — see plan «Known
 * deviations from spec» #2.
 */
export function validateFrdoRow(row: FrdoRegistryRow): FrdoRegistryRowError[] {
  const errs: FrdoRegistryRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      documentId: row.documentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.registrationNumber?.trim())
    push('registrationNumber', 'Регистрационный номер документа отсутствует');
  if (!DATE_RE.test(row.issueDate ?? ''))
    push('issueDate', 'Дата выдачи должна быть в формате ДД.ММ.ГГГГ');
  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.documentKindCode?.trim())
    push('documentKind', 'Вид документа не сопоставлен классификатору ФРДО');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');

  // СНИЛС опционален; но если указан — должен быть валиден.
  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  return errs;
}
