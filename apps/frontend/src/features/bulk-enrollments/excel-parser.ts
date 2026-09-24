import * as XLSX from 'xlsx';

import type { ImportField, ParseResult, ParsedRow } from './types';

/**
 * Разбор XLSX/CSV в строки импорта (Phase 2 Plan A; расширен в МГ-C3.1, срез 10.2).
 *
 * Заголовки узнаются по синонимам без учёта регистра: человек пишет «Фамилия Имя Отчество» или
 * «e-mail» — колонка находится. ФИО принимается одной колонкой или тремя (фамилия, имя, отчество);
 * обязательны ФИО (в любом виде) и почта.
 */
const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  fullName: ['фио', 'фамилия имя отчество', 'fio', 'fullname', 'name'],
  lastName: ['фамилия', 'lastname', 'surname'],
  firstName: ['имя', 'имя слушателя', 'firstname'],
  middleName: ['отчество', 'middlename', 'patronymic'],
  email: ['email', 'e-mail', 'эл. почта', 'эл.почта', 'почта', 'mail'],
  snils: ['снилс', 'snils'],
  position: ['должность', 'position', 'позиция'],
  dateOfBirth: ['дата рождения', 'дата рожд.', 'др', 'д.р.', 'birthdate', 'dateofbirth'],
  gender: ['пол', 'gender', 'sex'],
  phone: ['телефон', 'тел.', 'тел', 'phone', 'мобильный'],
  passportSeries: ['серия паспорта', 'паспорт серия', 'серия'],
  passportNumber: ['номер паспорта', 'паспорт номер', 'номер'],
  passportIssuedAt: ['дата выдачи', 'паспорт дата выдачи', 'выдан'],
  passportIssuedBy: ['кем выдан', 'паспорт кем выдан'],
  citizenship: ['гражданство', 'страна', 'citizenship'],
  educationLevel: ['образование', 'уровень образования', 'education'],
  companyInn: ['инн', 'инн компании', 'компания (инн)', 'компания', 'организация', 'inn']
};

const FIELD_ORDER = Object.keys(HEADER_SYNONYMS) as ImportField[];

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mapHeaders(headerRow: unknown[]): Partial<Record<ImportField, number>> {
  const result: Partial<Record<ImportField, number>> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeader(headerRow[i]);
    if (!cell) continue;
    for (const field of FIELD_ORDER) {
      if (result[field] != null) continue;
      if (HEADER_SYNONYMS[field].includes(cell)) {
        result[field] = i;
        break;
      }
    }
  }
  /* Старые файлы: одна колонка «Имя» без «Фамилии» — это ФИО целиком, а не имя. */
  if (result.fullName == null && result.firstName != null && result.lastName == null) {
    result.fullName = result.firstName;
    delete result.firstName;
  }
  return result;
}

function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  if (cell instanceof Date) {
    /* Excel хранит даты числом; в текст — по-русски, как человек и написал бы. */
    const d = String(cell.getUTCDate()).padStart(2, '0');
    const m = String(cell.getUTCMonth() + 1).padStart(2, '0');
    return `${d}.${m}.${cell.getUTCFullYear()}`;
  }
  return String(cell).trim();
}

const OPTIONAL_FIELDS: ImportField[] = [
  'lastName',
  'firstName',
  'middleName',
  'snils',
  'position',
  'dateOfBirth',
  'gender',
  'phone',
  'passportSeries',
  'passportNumber',
  'passportIssuedAt',
  'passportIssuedBy',
  'citizenship',
  'educationLevel',
  'companyInn'
];

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  try {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], errors: [{ code: 'empty_sheet', message: 'В файле нет листов' }] };
    }
    const sheet = wb.Sheets[firstSheetName]!;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (aoa.length === 0) {
      return { rows: [], errors: [{ code: 'empty_sheet', message: 'Лист пустой' }] };
    }

    const headerRow = aoa[0]!;
    const cols = mapHeaders(headerRow);
    const hasName = cols.fullName != null || (cols.lastName != null && cols.firstName != null);
    if (!hasName || cols.email == null) {
      return {
        rows: [],
        errors: [
          {
            code: 'missing_required_columns',
            message: 'Не найдены обязательные колонки: ФИО (или Фамилия и Имя) и Почта'
          }
        ]
      };
    }

    const rows: ParsedRow[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const dataRow = aoa[i];
      if (!dataRow || dataRow.every((c) => cellToString(c) === '')) continue;
      const fullName = cols.fullName != null ? cellToString(dataRow[cols.fullName]) : '';
      const email = cellToString(dataRow[cols.email]);
      const row: ParsedRow = { rowNumber: i + 1, fullName, email };
      for (const field of OPTIONAL_FIELDS) {
        const index = cols[field];
        if (index == null) continue;
        const value = cellToString(dataRow[index]);
        if (value) row[field] = value;
      }
      if (!row.fullName && !row.lastName && !email) continue;
      rows.push(row);
    }

    return { rows, errors: [] };
  } catch (err) {
    return {
      rows: [],
      errors: [
        {
          code: 'parse_failed',
          message: err instanceof Error ? err.message : 'Не удалось распарсить файл'
        }
      ]
    };
  }
}
