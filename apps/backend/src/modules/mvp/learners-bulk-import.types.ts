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
  /** ФИО одной колонкой — или фамилия, имя, отчество отдельно (МГ-C3.1, срез 10.1). */
  fullName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  /** Email, регистронезависимый. */
  email: string;
  /** СНИЛС в формате `XXX-XXX-XXX YY` или `XXXXXXXXXYY`. Опционально. */
  snils?: string;
  /** Должность ученика (для протоколов, удостоверений). Опционально. */
  position?: string;
  /** Дата рождения — «ДД.ММ.ГГГГ» или ISO; сервер хранит ISO. Опционально. */
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedAt?: string;
  passportIssuedBy?: string;
  citizenship?: string;
  educationLevel?: string;
  /** Компания по ИНН: найдена — слушатель привязан, нет — заведён без компании с предупреждением (РМ101). */
  companyInn?: string;
}

/** Что сервер хранит после разбора колонок: даты в ISO, пол `m`/`f`, образование кодом ФРДО. */
export interface NormalizedImportFields {
  fullName: string;
  dateOfBirth?: string;
  gender?: 'm' | 'f';
  phone?: string;
  passport?: { series: string; number: string; issuedAt?: string; issuedBy?: string };
  citizenship?: string;
  educationLevel?: string;
  companyInn?: string;
}

/**
 * Результат классификации одной строки до отправки в storage.
 * `create` — нет учётки в tenant, надо создать.
 * `reuse` — существующая учётка найдена по email/СНИЛС.
 * `invalid` — нельзя обработать (есть errors).
 */
export type RowClassification = 'create' | 'reuse' | 'invalid';

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

export interface ClassifiedRow {
  row: BulkImportRow;
  classification: RowClassification;
  /** Если `reuse` — id найденного учётка. */
  reuseLearnerId?: string;
  errors: RowError[];
  normalized?: NormalizedImportFields;
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
  /** Строка принята, но что-то не сделано (компания по ИНН не найдена) — поимённо (РМ101). */
  warnings?: string[];
}

export interface BulkImportOutcome {
  idempotencyKey: string;
  /** Без группы — только заведение (вставка списком в реестре, РМ102). */
  groupId?: string;
  total: number;
  created: number;
  reused: number;
  enrolled: number;
  failed: number;
  rows: BulkImportOutcomeRow[];
}

/** Запись idempotency для in-memory state. Persistent в Postgres-варианте — отдельная таблица. */
export interface BulkImportIdempotencyRecord {
  /**
   * Required: the Postgres snapshot store (`learning.mvp_runtime_documents`) keys every
   * persisted MVP collection entity by a NOT NULL `id` column. Omitting it made the whole
   * tenant snapshot save throw after any successful bulk-import (cf. sibling
   * `BulkEnrollmentIdempotencyRecord`, which always carried an id).
   */
  id: string;
  tenantId: string;
  idempotencyKey: string;
  outcome: BulkImportOutcome;
  createdAt: string;
}
