import * as XLSX from 'xlsx';

import type { ParseResult, ParsedRow } from './types';

/**
 * Phase 2 Plan A — парсинг Excel/CSV buffer в нормализованные ParsedRow.
 *
 * Pure function: только in/out, без I/O. SheetJS auto-определяет формат.
 * Первая строка — заголовки. Принимаем синонимы (case-insensitive trim).
 *
 * rowNumber = индекс в Excel (header = 1, первая строка данных = 2).
 */

const HEADER_SYNONYMS: Record<keyof Omit<ParsedRow, 'rowNumber'>, readonly string[]> = {
  fullName: ['фио', 'имя', 'фамилия имя отчество', 'fio', 'fullname', 'name'],
  email: ['email', 'e-mail', 'эл. почта', 'эл.почта', 'почта', 'mail'],
  snils: ['снилс', 'snils'],
  position: ['должность', 'position', 'позиция']
};

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .trim();
}

function mapHeaders(headerRow: unknown[]): {
  fullName?: number;
  email?: number;
  snils?: number;
  position?: number;
} {
  const result: { fullName?: number; email?: number; snils?: number; position?: number } = {};
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeader(headerRow[i]);
    if (!cell) continue;
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as Array<
      [keyof typeof HEADER_SYNONYMS, readonly string[]]
    >) {
      if (result[field] != null) continue;
      if (synonyms.includes(cell)) {
        result[field] = i;
        break;
      }
    }
  }
  return result;
}

function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell).trim();
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
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
    if (cols.fullName == null || cols.email == null) {
      return {
        rows: [],
        errors: [
          {
            code: 'missing_required_columns',
            message: 'Не найдены обязательные колонки: ФИО и Email'
          }
        ]
      };
    }

    const rows: ParsedRow[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const dataRow = aoa[i];
      if (!dataRow || dataRow.every((c) => cellToString(c) === '')) continue;
      const fullName = cellToString(dataRow[cols.fullName]);
      const email = cellToString(dataRow[cols.email]);
      if (!fullName && !email) continue;
      const row: ParsedRow = {
        rowNumber: i + 1,
        fullName,
        email
      };
      if (cols.snils != null) {
        const snils = cellToString(dataRow[cols.snils]);
        if (snils) row.snils = snils;
      }
      if (cols.position != null) {
        const position = cellToString(dataRow[cols.position]);
        if (position) row.position = position;
      }
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
