import { parseFullName } from '../fio.js';
import { isValidSnilsChecksum, normalizeSnils } from '../snils.util.js';

/**
 * Строки слушателей из мастера группы (ТЗ перехода §6.2, шаг 3): «ФИО; должность; СНИЛС;
 * email; телефон» — построчно, разделитель «;» (или табуляция из таблицы). Разбор ФИО —
 * общий с остальными путями (`parseFullName`), СНИЛС — та же контрольная сумма, что у импорта.
 * Почта необязательна: у слушателя без почты доступ выдаётся листом (МГ-C4), а не письмом.
 */
export interface WizardLearnerRowInput {
  rowNumber: number;
  fullName: string;
  position?: string | undefined;
  snils?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
}

export interface WizardLearnerRowParsed {
  rowNumber: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  position?: string;
  /** Нормализованный СНИЛС (11 цифр) или undefined. */
  snils?: string;
  email?: string;
  phone?: string;
}

export interface WizardLearnerRowError {
  rowNumber: number;
  code: 'fullname_invalid' | 'snils_invalid' | 'email_invalid' | 'duplicate_in_batch';
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Одна текстовая строка «ФИО; должность; СНИЛС; email; телефон» → входная запись. */
export function splitWizardLearnerLine(line: string, rowNumber: number): WizardLearnerRowInput {
  const cells = line.split(/;|\t/).map((c) => c.trim());
  const [fullName = '', position, snils, email, phone] = cells;
  return {
    rowNumber,
    fullName,
    ...(position ? { position } : {}),
    ...(snils ? { snils } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {})
  };
}

/**
 * Проверка строк по правилам путей ввода: ФИО — минимум фамилия и имя, СНИЛС — 11 цифр с
 * контрольной суммой, почта — по форме; дубли внутри пачки по СНИЛС или почте — отказ второй
 * строки. Частичный успех: плохая строка помечается, остальные принимаются.
 */
export function classifyWizardLearnerRows(rows: ReadonlyArray<WizardLearnerRowInput>): {
  accepted: WizardLearnerRowParsed[];
  rejected: WizardLearnerRowError[];
} {
  const accepted: WizardLearnerRowParsed[] = [];
  const rejected: WizardLearnerRowError[] = [];
  const seenSnils = new Set<string>();
  const seenEmail = new Set<string>();
  for (const row of rows) {
    const fio = parseFullName(row.fullName ?? '');
    if (!fio.lastName || !fio.firstName) {
      rejected.push({
        rowNumber: row.rowNumber,
        code: 'fullname_invalid',
        message: 'ФИО: укажите фамилию и имя (отчество — по желанию).'
      });
      continue;
    }
    let snils: string | undefined;
    if (row.snils?.trim()) {
      const digits = normalizeSnils(row.snils);
      if (digits.length !== 11 || !isValidSnilsChecksum(digits)) {
        rejected.push({
          rowNumber: row.rowNumber,
          code: 'snils_invalid',
          message: 'СНИЛС не проходит проверку контрольной суммы — проверьте 11 цифр по карточке.'
        });
        continue;
      }
      snils = digits;
    }
    const email = row.email?.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) {
      rejected.push({
        rowNumber: row.rowNumber,
        code: 'email_invalid',
        message: 'Почта не похожа на адрес — проверьте написание или оставьте поле пустым.'
      });
      continue;
    }
    if ((snils && seenSnils.has(snils)) || (email && seenEmail.has(email))) {
      rejected.push({
        rowNumber: row.rowNumber,
        code: 'duplicate_in_batch',
        message: 'Такой СНИЛС или почта уже есть выше в списке — строка пропущена.'
      });
      continue;
    }
    if (snils) seenSnils.add(snils);
    if (email) seenEmail.add(email);
    accepted.push({
      rowNumber: row.rowNumber,
      firstName: fio.firstName,
      lastName: fio.lastName,
      ...(fio.middleName ? { middleName: fio.middleName } : {}),
      ...(row.position?.trim() ? { position: row.position.trim() } : {}),
      ...(snils ? { snils } : {}),
      ...(email ? { email } : {}),
      ...(row.phone?.trim() ? { phone: row.phone.trim() } : {})
    });
  }
  return { accepted, rejected };
}
