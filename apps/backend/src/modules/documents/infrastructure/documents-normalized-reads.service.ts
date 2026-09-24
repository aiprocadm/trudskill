import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { GENERATED_DOCUMENTS_REPOSITORY } from './repositories/generated-documents.repository.js';

import type { BaseFilter } from '../documents.dto.js';
import type { IssuedDocumentFilter, IssuedDocumentsPage } from '../documents.service.js';
import type { GeneratedDocumentEntity } from '../documents.types.js';
import type {
  DocumentListPage,
  GeneratedDocumentsRepository
} from './repositories/generated-documents.repository.js';

/** Как у `DocumentsService.page`: страница с 1, размер по умолчанию 20; потолок HTTP — на границе. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Чтение выданных документов из `documents.generated_documents` (Фаза 1, срез 5b) — зеркало
 * `DocumentsService.listDocuments/getDocument/listIssuedDocuments` с той же формой ответа, но
 * асинхронное и без снимка домена документов: контроллер выбирает между ними по флагу
 * `LMS_NORMALIZED_COLLECTIONS=…,generatedDocuments`. Правила — из снимка: `documents.read`
 * означает весь центр, чужой центр и несуществующий документ — один и тот же 404.
 */
@Injectable()
export class DocumentsNormalizedReadsService {
  constructor(
    @Inject(GENERATED_DOCUMENTS_REPOSITORY) private readonly documents: GeneratedDocumentsRepository
  ) {}

  async listDocuments(tenantId: string, query: BaseFilter): Promise<DocumentListPage> {
    const rawPage = Number(query.page ?? 1);
    const rawSize = Number(query.pageSize ?? DEFAULT_PAGE_SIZE);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;
    const pageSize =
      Number.isFinite(rawSize) && rawSize >= 1 ? Math.trunc(rawSize) : DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();
    return this.documents.list(tenantId, {
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.sourceEntityType ? { sourceEntityType: query.sourceEntityType } : {}),
      ...(query.sourceEntityId ? { sourceEntityId: query.sourceEntityId } : {})
    });
  }

  async getDocument(tenantId: string, id: string): Promise<GeneratedDocumentEntity> {
    const found = await this.documents.get(tenantId, id);
    if (!found)
      throw new NotFoundException({ code: 'not_found', message: `Entity ${id} not found` });
    return found;
  }

  async listIssuedDocuments(
    tenantId: string,
    filter: IssuedDocumentFilter
  ): Promise<IssuedDocumentsPage> {
    return this.documents.listIssued(tenantId, filter);
  }
}
