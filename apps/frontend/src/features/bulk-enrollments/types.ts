/**
 * Phase 2 Plan A — frontend-зеркало backend типов (apps/backend/src/modules/mvp/learners-bulk-import.types.ts).
 *
 * Дублирование преднамеренное: контракт API ещё не вынесен в packages/shared-types
 * (см. план §Open questions Q3 — выносим, если появится ≥3 правки в обоих местах).
 */

/** Одна спарсенная строка Excel — то, что фронт шлёт backend'у. */
export interface ParsedRow {
  rowNumber: number;
  /** ФИО одной колонкой — или фамилия, имя, отчество отдельно (МГ-C3.1, срез 10.2). */
  fullName: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  email: string;
  snils?: string;
  position?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedAt?: string;
  passportIssuedBy?: string;
  citizenship?: string;
  educationLevel?: string;
  companyInn?: string;
}

/** Колонки файла, которые узнаёт парсер (все, кроме номера строки). */
export type ImportField = keyof Omit<ParsedRow, 'rowNumber'>;

/** Ошибка парсинга файла (header missing, и т.п.). */
export interface ParseError {
  code: 'missing_required_columns' | 'empty_sheet' | 'parse_failed';
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

/** Ошибка валидации поля (по строке). */
export interface RowError {
  field:
    | 'fullName'
    | 'email'
    | 'snils'
    | 'position'
    | 'dateOfBirth'
    | 'gender'
    | 'phone'
    | 'passport'
    | 'educationLevel'
    | 'companyInn'
    | 'row';
  code: string;
  message: string;
}

/** Frontend-классификация: только valid/invalid (reuse решается backend'ом). */
export type FrontendClassification = 'valid' | 'invalid';

export interface ClassifiedParsedRow {
  row: ParsedRow;
  classification: FrontendClassification;
  errors: RowError[];
}

/** Запрос на bulk-import (то, что улетает в POST /learners/bulk-import). */
export interface BulkImportRequest {
  idempotencyKey: string;
  /** Без группы — только заведение (вставка списком в реестре, РМ102). */
  groupId?: string;
  rows: ParsedRow[];
}

export interface BulkImportOutcomeRow {
  rowNumber: number;
  status: 'created' | 'reused' | 'enrolled_only' | 'failed';
  learnerId?: string;
  enrollmentId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Строка принята, но что-то не сделано (компания по ИНН не найдена) — поимённо. */
  warnings?: string[];
}

export interface BulkImportOutcome {
  idempotencyKey: string;
  groupId?: string;
  total: number;
  created: number;
  reused: number;
  enrolled: number;
  failed: number;
  rows: BulkImportOutcomeRow[];
}
