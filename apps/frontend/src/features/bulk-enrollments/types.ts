/**
 * Phase 2 Plan A — frontend-зеркало backend типов (apps/backend/src/modules/mvp/learners-bulk-import.types.ts).
 *
 * Дублирование преднамеренное: контракт API ещё не вынесен в packages/shared-types
 * (см. план §Open questions Q3 — выносим, если появится ≥3 правки в обоих местах).
 */

/** Одна спарсенная строка Excel — то, что фронт шлёт backend'у. */
export interface ParsedRow {
  rowNumber: number;
  fullName: string;
  email: string;
  snils?: string;
  position?: string;
}

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
  field: 'fullName' | 'email' | 'snils' | 'position' | 'row';
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
  groupId: string;
  rows: ParsedRow[];
}

export interface BulkImportOutcomeRow {
  rowNumber: number;
  status: 'created' | 'reused' | 'enrolled_only' | 'failed';
  learnerId?: string;
  enrollmentId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface BulkImportOutcome {
  idempotencyKey: string;
  groupId: string;
  total: number;
  created: number;
  reused: number;
  enrolled: number;
  failed: number;
  rows: BulkImportOutcomeRow[];
}
