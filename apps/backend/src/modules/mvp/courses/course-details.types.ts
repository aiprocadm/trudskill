/**
 * МГ-E2.1 (срез 16.1): поля курса из карточки CDOPROF — только тип, без декораторов.
 *
 * Отдельным файлом нарочно: `mvp.types.ts` читают и те, кто собирается без поддержки
 * декораторов (фронтовые e2e-проверки импортируют серверные службы), а тела запросов с
 * `class-validator` живут в `course-details.ts`.
 */
export interface CourseDetails {
  presentationTitle?: string;
  sortNo?: number;
  price?: number;
  responsibleUserId?: string;
  note?: string;
  periodDaysDefault?: number;
  frdoDocumentKind?: string;
  certificateNumberParts?: string[];
  docExtraFields?: Array<{ key: string; label: string; value: string }>;
}
