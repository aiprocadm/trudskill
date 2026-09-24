import type { IssuedDocumentFilter } from '../../documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents.types.js';

/**
 * Репозиторий выданных документов (МГ-A1.1/A1.2, Фаза 1 срез 5b). Читает
 * `documents.generated_documents`, которую наполняют бэкфилл и проекция при сохранении
 * снимка документов (срез 5a). Скоупа по слушателю или контрагенту здесь нет — как в снимке:
 * `documents.read` означает «все документы центра», кабинет и портал идут своими ручками MVP.
 */
export const GENERATED_DOCUMENTS_REPOSITORY = Symbol('GENERATED_DOCUMENTS_REPOSITORY');

export interface DocumentListQuery {
  page: number;
  pageSize: number;
  /** Поиск по названию, номеру и типу документа (РМ43: не по ПДн из бланка). */
  search?: string;
  documentType?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
}

export interface DocumentListPage {
  items: GeneratedDocumentEntity[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GeneratedDocumentsRepository {
  list(tenantId: string, query: DocumentListQuery): Promise<DocumentListPage>;
  get(tenantId: string, id: string): Promise<GeneratedDocumentEntity | null>;
  /** Книга выдачи: дата документа по убыванию, затем id по убыванию — как в снимке. */
  listIssued(
    tenantId: string,
    filter: IssuedDocumentFilter
  ): Promise<{ items: GeneratedDocumentEntity[]; total: number }>;
}
