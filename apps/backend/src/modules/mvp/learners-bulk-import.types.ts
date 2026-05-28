/**
 * Phase 2 Plan A — bulk-import учеников из Excel.
 *
 * Frontend парсит файл и шлёт массив нормализованных строк сюда. Backend
 * классифицирует (создать / переиспользовать / отклонить), создаёт недостающих
 * учеников, зачисляет всех валидных в группу одной транзакцией с idempotency.
 *
 * Принцип `partial-success`: невалидные строки не блокируют валидные.
 */

/** Одна строка, готовая к импорту (после парсинга Excel на фронтенде). */
export interface BulkImportRow {
  /** Позиция строки в исходном файле (header = 1, первая данных = 2). Сохраняется в outcome для UX. */
  rowNumber: number;
  /** ФИО в формате «Фамилия Имя [Отчество]», 2-3 слова кириллицей. */
  fullName: string;
  /** Email, регистронезависимый. */
  email: string;
  /** СНИЛС в формате `XXX-XXX-XXX YY` или `XXXXXXXXXYY`. Опционально. */
  snils?: string;
  /** Должность ученика (для протоколов, удостоверений). Опционально. */
  position?: string;
}

/**
 * Результат классификации одной строки до отправки в storage.
 * `create` — нет учётки в tenant, надо создать.
 * `reuse` — существующая учётка найдена по email/СНИЛС.
 * `invalid` — нельзя обработать (есть errors).
 */
export type RowClassification = 'create' | 'reuse' | 'invalid';

export interface RowError {
  field: 'fullName' | 'email' | 'snils' | 'position' | 'row';
  code: string;
  message: string;
}

export interface ClassifiedRow {
  row: BulkImportRow;
  classification: RowClassification;
  /** Если `reuse` — id найденного учётка. */
  reuseLearnerId?: string;
  errors: RowError[];
}

/** Снимок существующих учётков tenant (используется classifyRows для reuse-детекции). */
export interface ExistingLearnersSnapshot {
  learners: Array<{ id: string; email?: string; snils?: string }>;
}

/** Outcome одной строки после полного процесса (классификация + создание + зачисление). */
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

/** Запись idempotency для in-memory state. Persistent в Postgres-варианте — отдельная таблица. */
export interface BulkImportIdempotencyRecord {
  tenantId: string;
  idempotencyKey: string;
  outcome: BulkImportOutcome;
  createdAt: string;
}
