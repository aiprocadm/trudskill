import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { OtRegistryRow, OtRegistryRowError } from '../mvp.types.js';

const INN_RE = /^[0-9]{10}$|^[0-9]{12}$/;
const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

export function validateRegistryRow(row: OtRegistryRow): OtRegistryRowError[] {
  const errs: OtRegistryRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      enrollmentId: row.enrollmentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim()) push('fullName', 'ФИО отсутствует');
  const snils = normalizeSnils(row.snils ?? '');
  if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  if (!INN_RE.test(row.employerInn ?? ''))
    push('employerInn', 'ИНН работодателя должен быть 10 или 12 цифр');
  if (!row.position?.trim()) push('position', 'Должность отсутствует');
  if (!row.protocolNumber?.trim()) push('protocolNumber', 'Номер протокола отсутствует');
  if (!DATE_RE.test(row.knowledgeCheckDate ?? ''))
    push('knowledgeCheckDate', 'Дата должна быть в формате ДД.ММ.ГГГГ');
  if (!row.programCode || !row.programRegistryId)
    push('programCode', 'Курс не сопоставлен программе реестра');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');
  return errs;
}
