/**
 * Pillar A Plan B §5.6 — типы для UI книги выдачи документов.
 *
 * Виды документов переехали в `features/documents/document-types.ts`: экран шаблонов держал
 * вторую копию того же списка прямо в разметке. Реэкспорт оставлен, чтобы не переписывать
 * импорты книги выдачи. Фронт по-прежнему имеет свой источник правды: если сервер добавит
 * или уберёт вид документа, сборка упадёт на несоответствии.
 */
import type { TemplateType } from '../documents/document-types';

export {
  ALL_TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  type TemplateType
} from '../documents/document-types';

/**
 * Состояния документа по-русски (`TXT-006`).
 *
 * В фильтре статуса выпадающий список показывал коды как есть — `generated`, `final`,
 * `archived`. Администратор учебного центра не обязан знать, что «final» это «выдан».
 */
export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  generated: 'Подготовлен',
  final: 'Выдан',
  archived: 'В архиве',
  revoked: 'Аннулирован'
};

/** Порядок в фильтре — от рабочего состояния к завершённому. */
export const FILTERABLE_DOCUMENT_STATUSES = ['generated', 'final', 'archived'];

export interface IssuedDocument {
  id: string;
  documentNumber?: string;
  documentType: TemplateType;
  status: string;
  documentDate?: string;
  groupOrderDocumentId?: string;
}

export interface IssuanceJournalFilter {
  from?: string;
  to?: string;
  types?: TemplateType[];
  status?: string;
  groupOrderDocumentId?: string;
  limit?: number;
  offset?: number;
}

export interface IssuanceJournalPage {
  items: IssuedDocument[];
  total: number;
}
